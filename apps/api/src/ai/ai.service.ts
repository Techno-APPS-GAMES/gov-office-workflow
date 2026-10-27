import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertMatterReadable } from '../auth/access';

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  status() {
    const endpoint = process.env.AI_ENDPOINT || '';
    const allowExternalTraining =
      String(process.env.AI_ALLOW_EXTERNAL_TRAINING || 'false').toLowerCase() === 'true';
    const allowConfidentialRemote =
      String(process.env.AI_ALLOW_CONFIDENTIAL_REMOTE || 'false').toLowerCase() === 'true';
    return {
      enabled: true,
      mode: endpoint ? 'remote' : 'local_briefing',
      remoteConfigured: Boolean(endpoint),
      model: process.env.AI_MODEL || (endpoint ? null : 'local-grounded-briefing'),
      groundedOnly: true,
      allowExternalTraining,
      allowConfidentialRemote,
      dataLeavesEnvironment: Boolean(endpoint),
      note: endpoint
        ? 'Answers use the configured model endpoint with authorized record context only. External training of NA data is forbidden unless AI_ALLOW_EXTERNAL_TRAINING=true (default false). CONFIDENTIAL matters never use a remote model unless AI_ALLOW_CONFIDENTIAL_REMOTE=true (default false).'
        : 'Local briefing mode — summarizes authorized records on this server; no external model call; no training on NA data.',
    };
  }

  private async assertVaultAccess(matterId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return;
    const grant = await this.prisma.vaultGrant.findFirst({
      where: { matterId, userId, expiresAt: { gt: new Date() } },
    });
    if (!grant) throw new ForbiddenException('Confidential matter locked — unlock vault first');
  }

  private async loadMatterContext(
    user: { id: string; role: Role },
    matterId: string,
  ) {
    const matter = await this.prisma.matter.findUnique({
      where: { id: matterId },
      include: {
        notes: { take: 20, orderBy: { number: 'asc' }, include: { author: { select: { displayName: true } } } },
        journeyEvents: { take: 40, orderBy: { createdAt: 'asc' } },
        routeSteps: {
          take: 20,
          orderBy: { createdAt: 'asc' },
          include: {
            fromUser: { select: { displayName: true } },
            toUser: { select: { displayName: true } },
          },
        },
        directions: { take: 10, orderBy: { createdAt: 'desc' } },
        attachments: { select: { fileName: true, extractedText: true, sizeBytes: true } },
        holder: { select: { displayName: true } },
        assignee: { select: { displayName: true } },
      },
    });
    if (!matter) throw new BadRequestException('Matter not found');
    assertMatterReadable(matter, user);
    if (matter.classification === Classification.CONFIDENTIAL) {
      await this.assertVaultAccess(matterId, user.id, user.role);
    }
    return matter;
  }

  private wantsUrdu(question: string) {
    return (
      /[\u0600-\u06FF]/.test(question) ||
      /\burdu\b/i.test(question) ||
      /خلاصہ|اردو|مختصر|رپورٹ/.test(question)
    );
  }

  private localBriefing(
    question: string,
    matter: Awaited<ReturnType<AiService['loadMatterContext']>> | null,
    recent: { diaryNo: string; subject: string; status: string }[],
  ) {
    const q = question.toLowerCase();
    const urdu = this.wantsUrdu(question);
    if (matter) {
      const lines = [
        urdu
          ? `مستند بریفنگ — ${matter.diaryNo} (Grounded briefing)`
          : `Grounded briefing for ${matter.diaryNo}`,
        urdu ? `موضوع: ${matter.subject}` : `Subject: ${matter.subject}`,
        `Status: ${matter.status.replace(/_/g, ' ')} · Classification: ${matter.classification}`,
        `Sender: ${matter.sender}`,
        `Holder: ${matter.holder?.displayName || '—'} · Assignee: ${matter.assignee?.displayName || '—'}`,
        '',
        urdu ? 'مراسلے کا اقتباس / Correspondence excerpt:' : 'Correspondence excerpt:',
        matter.body.slice(0, 1200) + (matter.body.length > 1200 ? '…' : ''),
      ];
      if (matter.decisionText) {
        lines.push('', `Decision (${matter.decisionType || 'recorded'}): ${matter.decisionText}`);
      }
      if (matter.routeSteps.length) {
        lines.push('', urdu ? 'حالیہ روٹنگ:' : 'Recent routing:');
        for (const s of matter.routeSteps.slice(-5)) {
          lines.push(
            `• ${s.fromUser?.displayName || '—'} → ${s.toUser?.displayName || '—'} (${s.procedure})`,
          );
        }
      }
      if (matter.notes.length) {
        lines.push('', urdu ? 'نوٹس:' : 'Notes:');
        for (const n of matter.notes.slice(-5)) {
          lines.push(`• #${n.number} ${n.author?.displayName}: ${n.text.slice(0, 200)}`);
        }
      }
      if (matter.directions.length) {
        lines.push('', urdu ? 'منسلک ہدایات:' : 'Linked directions:');
        for (const d of matter.directions) {
          lines.push(`• ${d.title} [${d.status}]`);
        }
      }
      if (matter.attachments.length) {
        lines.push('', `Attachments (${matter.attachments.length}):`);
        for (const a of matter.attachments.slice(0, 8)) {
          lines.push(`• ${a.fileName}${a.extractedText ? ' (OCR available)' : ''}`);
        }
      }
      if (urdu) {
        lines.push(
          '',
          'مختصر خلاصہ (انسانی جائزہ درکار): یہ فائل اوپر دیے گئے مستند ریکارڈ پر مبنی ہے۔ کوئی خود کار فیصلہ جاری نہیں کیا گیا۔',
          'Concise EN: Summary is grounded only in the authorized record above; human review required before official use.',
        );
      } else if (q.includes('summar') || q.includes('brief') || q.includes('status')) {
        lines.push(
          '',
          'Suggested next step: review journey, confirm holder, and record a decision or direction if awaiting Speaker action.',
        );
      }
      lines.push(
        '',
        urdu
          ? '— مقامی مستند بریفنگ (کوئی بیرونی ماڈل نہیں)۔ صرف مجاز ریکارڈ استعمال ہوا۔'
          : '— Local grounded briefing (no external model). Answers use only this matter’s authorized record.',
      );
      return lines.join('\n');
    }

    const lines = [
      'Workspace briefing (no matter selected)',
      '',
      `Recent non-confidential matters (${recent.length}):`,
    ];
    for (const m of recent) {
      lines.push(`• ${m.diaryNo} — ${m.subject} [${m.status.replace(/_/g, ' ')}]`);
    }
    if (!recent.length) lines.push('• No matters registered yet.');
    lines.push(
      '',
      'Tip: pick a matter above for a file-specific briefing, routing history, and notes.',
      '',
      '— Local grounded briefing (no external model).',
    );
    return lines.join('\n');
  }

  async ask(
    user: { id: string; role: Role },
    question: string,
    matterId?: string,
  ) {
    if (!question?.trim()) throw new BadRequestException('Question required');
    const maxQuestion = 2000;
    if (question.length > maxQuestion) {
      throw new BadRequestException(`Question too long (max ${maxQuestion} characters)`);
    }

    let matter: Awaited<ReturnType<AiService['loadMatterContext']>> | null = null;
    let context = '';
    let recent: { diaryNo: string; subject: string; status: string }[] = [];

    if (matterId) {
      matter = await this.loadMatterContext(user, matterId);
      context = JSON.stringify({
        diaryNo: matter.diaryNo,
        subject: matter.subject,
        status: matter.status,
        classification: matter.classification,
        body: matter.body.slice(0, 8000),
        decisionText: matter.decisionText,
        notes: matter.notes.map((n) => n.text),
        journey: matter.journeyEvents.map((j) => j.summary),
        extracted: matter.attachments
          .map((a) => a.extractedText?.slice(0, 2000))
          .filter(Boolean),
      });
    } else {
      recent = await this.prisma.matter.findMany({
        where: { classification: { not: Classification.CONFIDENTIAL } },
        take: 12,
        orderBy: { updatedAt: 'desc' },
        select: { diaryNo: true, subject: true, status: true },
      });
      context = JSON.stringify({ recentMatters: recent });
    }

    const endpoint = process.env.AI_ENDPOINT;
    const allowConfidentialRemote =
      String(process.env.AI_ALLOW_CONFIDENTIAL_REMOTE || 'false').toLowerCase() === 'true';
    let answer: string;
    let mode: 'remote' | 'local_briefing';

    if (
      endpoint &&
      matter?.classification === Classification.CONFIDENTIAL &&
      !allowConfidentialRemote
    ) {
      mode = 'local_briefing';
      answer = this.localBriefing(question, matter, recent);
    } else if (endpoint) {
      mode = 'remote';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL || 'client-approved',
            messages: [
              {
                role: 'system',
                content:
                  'You are a grounded government office assistant. Answer ONLY using the provided authorized record context. If insufficient, say so. Never invent diary numbers or decisions. Do not store or train on client data. When the user asks in Urdu or requests Urdu, reply with a clear Urdu summary plus a short English restatement. Flag that human review is required before any official use.',
              },
              { role: 'user', content: `Context:\n${context}\n\nQuestion:\n${question}` },
            ],
          }),
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          throw new BadRequestException('AI endpoint timed out after 20s');
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new BadRequestException(`AI endpoint error: ${res.status} ${errText.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        answer?: string;
      };
      answer =
        data.choices?.[0]?.message?.content ||
        data.answer ||
        JSON.stringify(data).slice(0, 2000);
    } else if (/^\s*TRANSLATE_TO_URDU/i.test(question)) {
      // No remote model configured — cannot invent a faithful Urdu speech translation locally.
      mode = 'local_briefing';
      answer =
        'LOCAL_BRIEFING: Urdu translation requires AI_ENDPOINT (or enter Remarks Urdu manually in Speeches).';
    } else {
      mode = 'local_briefing';
      answer = this.localBriefing(question, matter, recent);
    }

    await this.audit.record({
      actorId: user.id,
      action: 'AI_ASK',
      entityType: matterId ? 'Matter' : 'System',
      entityId: matterId || null,
      summary: `AI ${mode}: ${question.slice(0, 120)}`,
    });

    return { answer, grounded: true, mode, matterId: matterId || null };
  }
}
