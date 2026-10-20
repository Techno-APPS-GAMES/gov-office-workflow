import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { formatAsOfficeDocument, isBrokenLayout, isWeakOcr } from './ocr-layout';

const LAYOUT_PROMPT = `You are extracting text from a scanned official National Assembly / government bill page for an e-office system.

Return PLAIN TEXT with proper office-document layout:
- Headings on their own lines: [AS PASSED BY THE NATIONAL ASSEMBLY], A BILL, CHAPTER-I, PRELIMINARY
- Body as flowing paragraphs (full lines), NEVER one word per line
- Numbered clauses 1. 2. and sub-clauses (1) (2) (i) (ii) with 2-space indent
- WHEREAS / AND WHEREAS as paragraphs
- Fix obvious OCR typos when clear from context (e.g. providt→provide)
- Do not invent missing sections. No markdown fences or commentary.`;

@Injectable()
export class OcrService {
  private readonly log = new Logger(OcrService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private crypto: CryptoService,
    private audit: AuditService,
    @Inject(forwardRef(() => FilesService)) private files: FilesService,
  ) {}

  async extractAttachment(attachmentId: string, user: { id: string; role: Role }) {
    if (process.env.OCR_ENABLED === 'false') {
      return { ok: false, reason: 'OCR disabled', chars: 0, preview: '' };
    }
    const att = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { matter: true },
    });
    if (!att) throw new NotFoundException();
    if (att.matter.classification === Classification.CONFIDENTIAL) {
      await this.files.assertVaultAccess(att.matterId, user.id, user.role);
    } else {
      try {
        await this.files.get(att.matterId, user);
      } catch {
        throw new ForbiddenException('No access to run OCR on this attachment');
      }
    }

    let buffer = await this.storage.getObject(att.storageKey);
    if (att.encrypted && att.wrappedDek) {
      buffer = this.crypto.decryptFile(buffer, att.wrappedDek);
    }

    const isPdf =
      att.contentType === 'application/pdf' || att.fileName.toLowerCase().endsWith('.pdf');
    const isImage = /^image\//.test(att.contentType);

    let text = '';
    let method = 'none';
    const preferVision = this.preferVision();

    if (isPdf) {
      // Prefer fast text-layer reflow first (stable); vision improves after if still weak
      const embedded = await this.extractPdfText(buffer);
      if (embedded.trim() && !isBrokenLayout(embedded)) {
        text = formatAsOfficeDocument(embedded);
        method = 'pdf-text';
      } else if (embedded.trim() && isBrokenLayout(embedded)) {
        this.log.warn(`Reflowing broken PDF text layer for ${att.fileName}`);
        text = formatAsOfficeDocument(embedded);
        method = 'pdf-text-reflow';
      }

      if (preferVision && this.visionEnabled() && (isWeakOcr(text) || isBrokenLayout(text))) {
        this.log.log(`OCR vision improve for ${att.fileName}`);
        try {
          const vision = await this.visionOcrPdfPages(buffer);
          if (vision.trim() && (!text.trim() || !isBrokenLayout(vision))) {
            text = formatAsOfficeDocument(vision);
            method = 'pdf-vision-layout';
          }
        } catch (e) {
          this.log.warn(`Vision OCR aborted: ${e}`);
        }
      }

      if (isWeakOcr(text) || isBrokenLayout(text)) {
        const ocrText = formatAsOfficeDocument(await this.ocrPdfPages(buffer));
        if (ocrText.trim() && (!text.trim() || !isBrokenLayout(ocrText) || ocrText.length > text.length)) {
          text = ocrText;
          method = isBrokenLayout(ocrText) ? 'pdf-ocr' : 'pdf-ocr-layout';
        }
      }

      // Always try AI reflow if still broken and we have a key
      if ((isBrokenLayout(text) || isWeakOcr(text)) && this.visionEnabled()) {
        if (!method.includes('vision-layout')) {
          const visionPages = await this.visionOcrPdfPages(buffer);
          if (visionPages.trim()) {
            text = formatAsOfficeDocument(visionPages);
            method = 'pdf-vision-layout';
          }
        }
        if (isBrokenLayout(text)) {
          const cleaned = await this.visionCleanupText(text);
          if (cleaned.trim()) {
            text = formatAsOfficeDocument(cleaned);
            method = 'pdf-vision-reflow';
          }
        }
      }
    } else if (isImage) {
      if (preferVision && this.visionEnabled()) {
        text = formatAsOfficeDocument(
          await this.visionOcrImage(buffer, att.contentType || 'image/png'),
        );
        method = text ? 'image-vision-layout' : 'none';
      }
      if (isWeakOcr(text)) {
        const local = formatAsOfficeDocument(await this.ocrImage(buffer));
        if (local.trim().length > text.trim().length) {
          text = local;
          method = 'image-ocr-layout';
        }
      }
      if (isWeakOcr(text) && this.visionEnabled()) {
        const vision = formatAsOfficeDocument(
          await this.visionOcrImage(buffer, att.contentType || 'image/png'),
        );
        if (vision.trim().length > text.trim().length) {
          text = vision;
          method = 'image-vision-layout';
        }
      }
    } else {
      const asText = buffer.toString('utf8');
      if (asText.trim()) {
        text = formatAsOfficeDocument(asText);
        method = 'plain';
      }
    }

    // Final hard reflow — never persist one-word-per-line columns
    text = formatAsOfficeDocument(text);
    if (isBrokenLayout(text) && this.visionEnabled()) {
      const cleaned = await this.visionCleanupText(text);
      if (cleaned.trim()) {
        text = formatAsOfficeDocument(cleaned);
        method = `${method}+reflow`;
      }
    }

    const saved = text.slice(0, 200_000);
    await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { extractedText: saved },
    });

    if (saved.trim()) {
      try {
        await this.files.recordOcrVersion(att.matterId, user, saved, att.fileName, method);
      } catch (e) {
        this.log.warn(`OCR version record skipped: ${e}`);
      }
    }

    await this.audit.record({
      actorId: user.id,
      action: 'OCR_EXTRACT',
      entityType: 'Attachment',
      entityId: attachmentId,
      summary: `OCR (${method}) extracted ${saved.length} chars from ${att.fileName}`,
    });

    if (!saved.trim()) {
      return {
        ok: false,
        reason: 'No readable text found. Check AI_API_KEY / OCR_PREFER_VISION and Re-run OCR.',
        chars: 0,
        preview: '',
        method,
      };
    }

    return {
      ok: true,
      chars: saved.length,
      preview: saved.slice(0, 800),
      method,
      layoutAware: !isBrokenLayout(saved),
    };
  }

  private preferVision() {
    if (String(process.env.OCR_PREFER_VISION || '').toLowerCase() === 'false') return false;
    return this.visionEnabled();
  }

  private visionEnabled() {
    return (
      String(process.env.OCR_VISION_FALLBACK || 'true').toLowerCase() !== 'false' &&
      Boolean(process.env.AI_API_KEY?.trim())
    );
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
        b: Buffer,
      ) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      return parsed.text || '';
    } catch (e) {
      this.log.warn(`PDF text extract failed: ${e}`);
      return '';
    }
  }

  private async preprocessPng(png: Buffer): Promise<Buffer> {
    try {
      const { createCanvas, loadImage } = await import('@napi-rs/canvas');
      const img = await loadImage(png);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = g > 210 ? 255 : Math.max(0, Math.min(255, (g - 140) * 1.55 + 128));
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      return canvas.toBuffer('image/png');
    } catch {
      return png;
    }
  }

  private async ocrImage(buffer: Buffer): Promise<string> {
    try {
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const input = isJpeg ? buffer : await this.preprocessPng(buffer);
      const Tesseract = await import('tesseract.js');
      const langs = process.env.OCR_LANGS || 'eng+urd';
      try {
        const result = await Tesseract.recognize(input, langs);
        return result.data.text || '';
      } catch (langErr) {
        this.log.warn(`OCR ${langs} failed (${langErr}); falling back to eng`);
        const result = await Tesseract.recognize(input, 'eng');
        return result.data.text || '';
      }
    } catch (e) {
      this.log.warn(`Image OCR failed: ${e}`);
      return '';
    }
  }

  private pdfMaxPages() {
    const n = Number(process.env.OCR_PDF_MAX_PAGES || 8);
    return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : 8;
  }

  private async renderPdfPagePng(buffer: Buffer, pageNum: number, scale: number): Promise<Buffer> {
    const { createCanvas } = await import('@napi-rs/canvas');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    }).promise;
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return this.preprocessPng(canvas.toBuffer('image/png'));
  }

  private async ocrPdfPages(buffer: Buffer): Promise<string> {
    const maxPages = this.pdfMaxPages();
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
        useWorkerFetch: false,
      }).promise;
      const pages = Math.min(doc.numPages, maxPages);
      const scale = Number(process.env.OCR_PDF_SCALE || 2.75);
      const chunks: string[] = [];
      for (let i = 1; i <= pages; i++) {
        const png = await this.renderPdfPagePng(buffer, i, Number.isFinite(scale) ? scale : 2.75);
        const pageText = await this.ocrImage(png);
        if (pageText.trim()) chunks.push(`[Page ${i}]\n${pageText.trim()}`);
      }
      return chunks.join('\n\n');
    } catch (e) {
      this.log.warn(`PDF page OCR failed: ${e}`);
      return '';
    }
  }

  private async visionOcrImage(buffer: Buffer, contentType: string): Promise<string> {
    const key = process.env.AI_API_KEY?.trim();
    if (!key) return '';
    const endpoint =
      process.env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.AI_VISION_MODEL || process.env.AI_MODEL || 'gpt-4o-mini';
    const maxBytes = 4_500_000;
    const payload = buffer.length > maxBytes ? buffer.subarray(0, maxBytes) : buffer;
    const b64 = payload.toString('base64');
    const mime = contentType.startsWith('image/') ? contentType : 'image/png';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: LAYOUT_PROMPT },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' },
                },
              ],
            },
          ],
          max_tokens: 4096,
          temperature: 0,
        }),
      });
      if (!res.ok) {
        this.log.warn(`Vision OCR HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return '';
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      this.log.warn(`Vision OCR failed: ${e}`);
      return '';
    }
  }

  private async shrinkPngForVision(png: Buffer): Promise<Buffer> {
    try {
      const { createCanvas, loadImage } = await import('@napi-rs/canvas');
      const img = await loadImage(png);
      const maxW = Number(process.env.OCR_VISION_MAX_WIDTH || 1400);
      if (!Number.isFinite(maxW) || img.width <= maxW) return png;
      const scale = maxW / img.width;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toBuffer('image/png');
    } catch {
      return png;
    }
  }

  private async visionOcrPdfPages(buffer: Buffer): Promise<string> {
    const maxVisionPages = Math.min(
      Number(process.env.OCR_VISION_MAX_PAGES || 5),
      this.pdfMaxPages(),
    );
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
        useWorkerFetch: false,
      }).promise;
      const pages = Math.min(doc.numPages, maxVisionPages);
      const scale = Number(process.env.OCR_VISION_SCALE || 1.5);
      const chunks: string[] = [];
      for (let i = 1; i <= pages; i++) {
        this.log.log(`Vision OCR page ${i}/${pages}`);
        let png = await this.renderPdfPagePng(
          buffer,
          i,
          Number.isFinite(scale) ? scale : 1.5,
        );
        png = await this.shrinkPngForVision(png);
        const pageText = await this.visionOcrImage(png, 'image/png');
        if (pageText.trim()) {
          chunks.push(pages > 1 ? `[Page ${i}]\n${pageText.trim()}` : pageText.trim());
        }
      }
      return chunks.join('\n\n');
    } catch (e) {
      this.log.warn(`PDF vision OCR failed: ${e}`);
      return '';
    }
  }

  private async visionCleanupText(broken: string): Promise<string> {
    const key = process.env.AI_API_KEY?.trim();
    if (!key) return '';
    const endpoint =
      process.env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.AI_MODEL || 'gpt-4o-mini';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'You repair OCR from Pakistani National Assembly bills into proper office paragraphs and headings. Fix obvious typos. Never invent clauses. Plain text only.',
            },
            {
              role: 'user',
              content: `${LAYOUT_PROMPT}\n\nBroken OCR extract:\n\n${broken.slice(0, 14000)}`,
            },
          ],
          max_tokens: 4096,
        }),
      });
      if (!res.ok) {
        this.log.warn(`Vision reflow HTTP ${res.status}`);
        return '';
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch {
      return '';
    }
  }
}
