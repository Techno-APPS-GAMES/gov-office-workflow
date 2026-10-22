import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ARCHIVED'] as const;
type SpeechStatus = (typeof STATUSES)[number];

function stripVersionMarker(body: string) {
  return body.replace(/\n?<!--gow-ver:\d+-->/g, '').trimEnd();
}

function versionOf(body: string) {
  const m = body.match(/<!--gow-ver:(\d+)-->/);
  return m ? Number(m[1]) : 1;
}

function withVersion(body: string, version: number) {
  return `${stripVersionMarker(body)}\n<!--gow-ver:${version}-->`;
}

function include() {
  return {
    author: { select: { id: true, displayName: true, role: true } },
    matter: { select: { id: true, diaryNo: true, subject: true, classification: true } },
  } as const;
}

@Injectable()
export class SpeechesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  list(status?: string) {
    const where =
      status && STATUSES.includes(status.toUpperCase() as SpeechStatus)
        ? { status: status.toUpperCase() }
        : undefined;
    return this.prisma.speech.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: include(),
    });
  }

  async get(id: string) {
    const s = await this.prisma.speech.findUnique({
      where: { id },
      include: include(),
    });
    if (!s) throw new NotFoundException('Speech not found');
    return s;
  }

  private async assertMatter(matterId: string | undefined | null) {
    if (!matterId) return null;
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter) throw new BadRequestException('Linked matter not found');
    return matter;
  }

  async create(
    authorId: string,
    data: {
      title: string;
      body: string;
      bodyUr?: string;
      talkingPoints?: string;
      talkingPointsUr?: string;
      language?: string;
      eventDate?: string;
      eventVenue?: string;
      matterId?: string;
      sourcesNote?: string;
      aiAssisted?: boolean;
    },
  ) {
    const title = (data.title || '').trim();
    const body = (data.body || '').trim();
    if (title.length < 3) throw new BadRequestException('Title required');
    if (body.length < 10) throw new BadRequestException('Remarks body required (min 10 characters)');

    const matter = await this.assertMatter(data.matterId);

    const s = await this.prisma.speech.create({
      data: {
        authorId,
        title,
        body: withVersion(body, 1),
        bodyUr: data.bodyUr?.trim() || null,
        talkingPoints: data.talkingPoints?.trim() || null,
        talkingPointsUr: data.talkingPointsUr?.trim() || null,
        language: data.language === 'ur' ? 'ur' : 'en',
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        eventVenue: data.eventVenue?.trim() || null,
        matterId: matter?.id || null,
        sourcesNote:
          data.sourcesNote?.trim() ||
          (matter ? `Source matter ${matter.diaryNo}: ${matter.subject}` : null),
        aiAssisted: Boolean(data.aiAssisted),
        status: 'DRAFT',
      },
      include: include(),
    });
    await this.audit.record({
      actorId: authorId,
      action: 'SPEECH_CREATE',
      entityType: 'Speech',
      entityId: s.id,
      summary: `Speech drafted: ${s.title}${matter ? ` · ${matter.diaryNo}` : ''}`,
    });
    return s;
  }

  async update(
    id: string,
    actorId: string,
    data: {
      title?: string;
      body?: string;
      bodyUr?: string;
      talkingPoints?: string;
      talkingPointsUr?: string;
      language?: string;
      eventDate?: string | null;
      eventVenue?: string;
      matterId?: string | null;
      sourcesNote?: string;
      aiAssisted?: boolean;
      markHumanReviewed?: boolean;
    },
  ) {
    const existing = await this.prisma.speech.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Speech not found');
    if (existing.status === 'ARCHIVED') {
      throw new BadRequestException('Archived speeches cannot be edited');
    }

    const bodyChanged =
      data.body !== undefined &&
      stripVersionMarker(data.body) !== stripVersionMarker(existing.body);
    const nextVersion = bodyChanged ? versionOf(existing.body) + 1 : versionOf(existing.body);
    const nextBody =
      data.body !== undefined ? withVersion(data.body, nextVersion) : existing.body;

    let matterId = existing.matterId;
    if (data.matterId !== undefined) {
      if (data.matterId === null || data.matterId === '') matterId = null;
      else {
        const m = await this.assertMatter(data.matterId);
        matterId = m?.id || null;
      }
    }

    const resetToDraft =
      bodyChanged &&
      (existing.status === 'APPROVED' ||
        existing.status === 'SUBMITTED' ||
        existing.status === 'REJECTED');

    const s = await this.prisma.speech.update({
      where: { id },
      data: {
        title: data.title?.trim() ?? existing.title,
        body: nextBody,
        bodyUr: data.bodyUr !== undefined ? data.bodyUr.trim() || null : existing.bodyUr,
        talkingPoints:
          data.talkingPoints !== undefined
            ? data.talkingPoints.trim() || null
            : existing.talkingPoints,
        talkingPointsUr:
          data.talkingPointsUr !== undefined
            ? data.talkingPointsUr.trim() || null
            : existing.talkingPointsUr,
        language:
          data.language !== undefined
            ? data.language === 'ur'
              ? 'ur'
              : 'en'
            : existing.language,
        eventDate:
          data.eventDate === undefined
            ? existing.eventDate
            : data.eventDate
              ? new Date(data.eventDate)
              : null,
        eventVenue:
          data.eventVenue !== undefined
            ? data.eventVenue.trim() || null
            : existing.eventVenue,
        matterId,
        sourcesNote:
          data.sourcesNote !== undefined
            ? data.sourcesNote.trim() || null
            : existing.sourcesNote,
        aiAssisted:
          data.aiAssisted !== undefined ? Boolean(data.aiAssisted) : existing.aiAssisted,
        humanReviewedAt: data.markHumanReviewed ? new Date() : existing.humanReviewedAt,
        approvedAt: resetToDraft ? null : existing.approvedAt,
        status: resetToDraft ? 'DRAFT' : existing.status,
      },
      include: include(),
    });
    await this.audit.record({
      actorId,
      action: 'SPEECH_UPDATE',
      entityType: 'Speech',
      entityId: id,
      summary: `Speech updated: ${s.title}${resetToDraft ? ' (returned to draft)' : ''}`,
    });
    return s;
  }

  private async notifyApprovers(speech: { id: string; title: string }, fromName: string) {
    const approvers = await this.prisma.user.findMany({
      where: {
        active: true,
        role: { in: [Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN] },
      },
      select: { id: true },
    });
    await Promise.all(
      approvers.map((u) =>
        this.notifications.create(
          u.id,
          'SPEECH',
          `Speech for authorization · ${speech.title}`,
          `${fromName} submitted remarks for review. Open Speeches & prompter.`,
          speech.id,
        ),
      ),
    );
  }

  async setStatus(
    id: string,
    actor: { id: string; role: Role; displayName?: string },
    status: string,
    reason?: string,
  ) {
    const existing = await this.prisma.speech.findUnique({
      where: { id },
      include: { author: { select: { displayName: true } } },
    });
    if (!existing) throw new NotFoundException('Speech not found');

    const next = (status || '').toUpperCase() as SpeechStatus;
    if (!STATUSES.includes(next)) {
      throw new BadRequestException(`Invalid status. Use: ${STATUSES.join(', ')}`);
    }

    const canAuthorize =
      actor.role === Role.SPEAKER ||
      actor.role === Role.SECRETARY_GENERAL ||
      actor.role === Role.ADMIN;

    const from = existing.status as SpeechStatus;

    if (next === 'SUBMITTED') {
      if (from !== 'DRAFT' && from !== 'REJECTED') {
        throw new BadRequestException('Only draft/rejected speeches can be submitted');
      }
      if (existing.aiAssisted && !existing.humanReviewedAt) {
        throw new BadRequestException(
          'Mark human review complete before submitting AI-assisted remarks (consultation §4)',
        );
      }
      if (stripVersionMarker(existing.body).length < 20) {
        throw new BadRequestException('Remarks too short to submit');
      }
    } else if (next === 'APPROVED') {
      if (!canAuthorize) throw new ForbiddenException('Not authorized to approve speeches');
      if (from !== 'SUBMITTED' && from !== 'DRAFT') {
        throw new BadRequestException('Approve from submitted (or draft for Speaker direct authorize)');
      }
      if (existing.aiAssisted && !existing.humanReviewedAt && from === 'SUBMITTED') {
        throw new BadRequestException('Human review required before approval of AI-assisted text');
      }
    } else if (next === 'REJECTED') {
      if (!canAuthorize) throw new ForbiddenException('Not authorized to reject speeches');
      if (from !== 'SUBMITTED') throw new BadRequestException('Only submitted speeches can be rejected');
      if (!(reason || '').trim() || (reason || '').trim().length < 5) {
        throw new BadRequestException('Reject reason required (min 5 characters)');
      }
    } else if (next === 'ARCHIVED') {
      if (!canAuthorize && actor.id !== existing.authorId) {
        throw new ForbiddenException();
      }
      if (from !== 'APPROVED' && from !== 'REJECTED') {
        throw new BadRequestException('Archive from approved or rejected only');
      }
    } else if (next === 'DRAFT') {
      if (from !== 'REJECTED' && from !== 'SUBMITTED') {
        throw new BadRequestException('Cannot move to draft from this status');
      }
    } else {
      throw new BadRequestException(`Transition ${from} → ${next} not allowed`);
    }

    const s = await this.prisma.speech.update({
      where: { id },
      data: {
        status: next,
        approvedAt: next === 'APPROVED' ? new Date() : existing.approvedAt,
        humanReviewedAt:
          next === 'APPROVED' && !existing.humanReviewedAt
            ? new Date()
            : existing.humanReviewedAt,
      },
      include: include(),
    });

    if (next === 'SUBMITTED') {
      await this.notifyApprovers(s, existing.author.displayName);
    }
    if (next === 'APPROVED' || next === 'REJECTED') {
      await this.notifications.create(
        existing.authorId,
        'SPEECH',
        `Speech ${next.toLowerCase()} · ${existing.title}`,
        next === 'REJECTED'
          ? reason!.trim().slice(0, 400)
          : 'Authorized for Speaker prompter delivery.',
        id,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'SPEECH_STATUS',
      entityType: 'Speech',
      entityId: id,
      summary: `Speech ${s.title} -> ${next}${reason ? `: ${reason.slice(0, 80)}` : ''}`,
    });
    return s;
  }
}
