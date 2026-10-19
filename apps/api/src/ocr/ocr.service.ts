import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';

function textQuality(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 0;
  const letters = (t.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
  return letters / Math.max(t.length, 1);
}

@Injectable()
export class OcrService {
  private readonly log = new Logger(OcrService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private crypto: CryptoService,
    private audit: AuditService,
    private files: FilesService,
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
      // Anyone who can open the matter may extract text (read path, not mutate-only).
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

    if (isPdf) {
      text = await this.extractPdfText(buffer);
      method = text.trim() ? 'pdf-text' : 'none';
      // Scanned / image-only PDFs need page raster OCR
      if (!text.trim() || textQuality(text) < 0.35 || text.trim().length < 40) {
        const ocrText = await this.ocrPdfPages(buffer);
        if (ocrText.trim().length > text.trim().length) {
          text = ocrText;
          method = 'pdf-ocr';
        }
      }
    } else if (isImage) {
      text = await this.ocrImage(buffer);
      method = 'image-ocr';
    } else {
      // Try UTF-8 dump for plain text uploads
      const asText = buffer.toString('utf8');
      if (textQuality(asText) > 0.5) {
        text = asText;
        method = 'plain';
      }
    }

    const saved = text.slice(0, 200_000);
    await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { extractedText: saved },
    });
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
        reason:
          'No readable text found. For scanned PDFs, ensure pages render; try a clearer scan or image upload.',
        chars: 0,
        preview: '',
        method,
      };
    }

    return {
      ok: true,
      chars: saved.length,
      preview: saved.slice(0, 500),
      method,
    };
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // Avoid pdf-parse package root (runs debug harness); use library entry.
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

  private async ocrImage(buffer: Buffer): Promise<string> {
    try {
      const Tesseract = await import('tesseract.js');
      const langs = process.env.OCR_LANGS || 'eng';
      try {
        const result = await Tesseract.recognize(buffer, langs);
        return result.data.text || '';
      } catch (langErr) {
        this.log.warn(`OCR ${langs} failed (${langErr}); falling back to eng`);
        const result = await Tesseract.recognize(buffer, 'eng');
        return result.data.text || '';
      }
    } catch (e) {
      this.log.warn(`Image OCR failed: ${e}`);
      return '';
    }
  }

  /** Rasterize first N PDF pages and OCR them (scanned acts / image PDFs). */
  private async ocrPdfPages(buffer: Buffer, maxPages = 3): Promise<string> {
    try {
      const { createCanvas } = await import('@napi-rs/canvas');
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
        useWorkerFetch: false,
      }).promise;
      const pages = Math.min(doc.numPages, maxPages);
      const chunks: string[] = [];
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        const png = canvas.toBuffer('image/png');
        const pageText = await this.ocrImage(png);
        if (pageText.trim()) {
          chunks.push(`--- Page ${i} ---\n${pageText.trim()}`);
        }
      }
      return chunks.join('\n\n');
    } catch (e) {
      this.log.warn(`PDF page OCR failed: ${e}`);
      return '';
    }
  }
}
