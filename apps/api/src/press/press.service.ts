import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PressStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const DEFAULT_WIRE =
  'PID, PTV News, Radio Pakistan, APP, National Parliamentary Reporters';
const DEFAULT_SOCIAL =
  'X / Twitter, Facebook, Instagram (official NA accounts only)';

function include() {
  return {
    author: { select: { id: true, displayName: true, role: true } },
    matter: { select: { id: true, diaryNo: true, subject: true } },
    clips: {
      orderBy: { observedAt: 'desc' as const },
      take: 8,
      include: { createdBy: { select: { displayName: true } } },
    },
  };
}

@Injectable()
export class PressService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  list(status?: string) {
    const where =
      status && Object.values(PressStatus).includes(status.toUpperCase() as PressStatus)
        ? { status: status.toUpperCase() as PressStatus }
        : undefined;
    return this.prisma.pressRelease.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: include(),
    });
  }

  async get(id: string) {
    const p = await this.prisma.pressRelease.findUnique({
      where: { id },
      include: include(),
    });
    if (!p) throw new NotFoundException('Press release not found');
    return p;
  }

  private async nextCode() {
    const year = new Date().getFullYear();
    const count = await this.prisma.pressRelease.count({
      where: { code: { startsWith: `PR-${year}-` } },
    });
    return `PR-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  private draftPid(code: string) {
    const year = new Date().getFullYear();
    const tail = code.split('-').pop() || '000';
    return `NA/PR/${year}/${tail}-DRAFT`;
  }

  private livePid() {
    const year = new Date().getFullYear().toString().slice(-2);
    const n = (randomBytes(2).readUInt16BE(0) % 9000) + 1000;
    return `PID(I)${n}/${year}`;
  }

  private async assertMatter(matterId?: string | null) {
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
      titleUr?: string;
      bodyUr?: string;
      wire?: string;
      socialTargets?: string;
      matterId?: string;
      sourcesNote?: string;
      embargoUntil?: string;
      aiAssisted?: boolean;
    },
  ) {
    const title = (data.title || '').trim();
    const body = (data.body || '').trim();
    if (title.length < 5) throw new BadRequestException('Headline required (min 5 characters)');
    if (body.length < 20) throw new BadRequestException('English body required (min 20 characters)');

    const matter = await this.assertMatter(data.matterId);
    const code = await this.nextCode();

    const p = await this.prisma.pressRelease.create({
      data: {
        authorId,
        title,
        body,
        titleUr: data.titleUr?.trim() || null,
        bodyUr: data.bodyUr?.trim() || null,
        wire: data.wire?.trim() || DEFAULT_WIRE,
        socialTargets: data.socialTargets?.trim() || DEFAULT_SOCIAL,
        matterId: matter?.id || null,
        sourcesNote:
          data.sourcesNote?.trim() ||
          (matter ? `Source matter ${matter.diaryNo}: ${matter.subject}` : null),
        embargoUntil: data.embargoUntil ? new Date(data.embargoUntil) : null,
        aiAssisted: Boolean(data.aiAssisted),
        code,
        pidRef: this.draftPid(code),
        status: PressStatus.DRAFT,
      },
      include: include(),
    });
    await this.audit.record({
      actorId: authorId,
      action: 'PRESS_CREATE',
      entityType: 'PressRelease',
      entityId: p.id,
      summary: `Press draft: ${p.code} · ${p.title}`,
    });
    return p;
  }

  async update(
    id: string,
    actor: { id: string; role: Role },
    data: {
      title?: string;
      body?: string;
      titleUr?: string;
      bodyUr?: string;
      wire?: string;
      socialTargets?: string;
      socialApproved?: boolean;
      matterId?: string | null;
      sourcesNote?: string;
      embargoUntil?: string | null;
      aiAssisted?: boolean;
      markHumanReviewed?: boolean;
    },
  ) {
    const existing = await this.prisma.pressRelease.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Press release not found');
    if (existing.status === PressStatus.DISPATCHED) {
      throw new BadRequestException('Dispatched releases cannot be edited');
    }

    const canEdit =
      actor.id === existing.authorId ||
      actor.role === Role.SPEAKER ||
      actor.role === Role.SECRETARY_GENERAL ||
      actor.role === Role.ADMIN;
    if (!canEdit) throw new ForbiddenException();

    let matterId = existing.matterId;
    if (data.matterId !== undefined) {
      if (!data.matterId) matterId = null;
      else matterId = (await this.assertMatter(data.matterId))?.id || null;
    }

    const embargoChanged =
      data.embargoUntil !== undefined &&
      (data.embargoUntil
        ? new Date(data.embargoUntil).getTime()
        : null) !== (existing.embargoUntil?.getTime() ?? null);

    const publishableChanged =
      (data.title !== undefined && data.title.trim() !== existing.title) ||
      (data.titleUr !== undefined && (data.titleUr.trim() || null) !== existing.titleUr) ||
      (data.body !== undefined && data.body.trim() !== existing.body) ||
      (data.bodyUr !== undefined && (data.bodyUr.trim() || null) !== existing.bodyUr) ||
      (data.wire !== undefined && data.wire.trim() !== (existing.wire || '').trim()) ||
      (data.socialTargets !== undefined &&
        (data.socialTargets.trim() || null) !== existing.socialTargets) ||
      embargoChanged;

    const reset =
      publishableChanged &&
      (existing.status === PressStatus.APPROVED ||
        existing.status === PressStatus.SUBMITTED);

    const p = await this.prisma.pressRelease.update({
      where: { id },
      data: {
        title: data.title?.trim() ?? existing.title,
        body: data.body?.trim() ?? existing.body,
        titleUr: data.titleUr !== undefined ? data.titleUr.trim() || null : existing.titleUr,
        bodyUr: data.bodyUr !== undefined ? data.bodyUr.trim() || null : existing.bodyUr,
        wire: data.wire?.trim() ?? existing.wire,
        socialTargets:
          data.socialTargets !== undefined
            ? data.socialTargets.trim() || null
            : existing.socialTargets,
        socialApproved: reset
          ? false
          : data.socialApproved !== undefined
            ? Boolean(data.socialApproved)
            : existing.socialApproved,
        matterId,
        sourcesNote:
          data.sourcesNote !== undefined
            ? data.sourcesNote.trim() || null
            : existing.sourcesNote,
        embargoUntil:
          data.embargoUntil === undefined
            ? existing.embargoUntil
            : data.embargoUntil
              ? new Date(data.embargoUntil)
              : null,
        aiAssisted:
          data.aiAssisted !== undefined ? Boolean(data.aiAssisted) : existing.aiAssisted,
        humanReviewedAt: data.markHumanReviewed ? new Date() : existing.humanReviewedAt,
        approvedAt: reset ? null : existing.approvedAt,
        rejectReason: reset ? null : existing.rejectReason,
        status: reset ? PressStatus.DRAFT : existing.status,
        pidRef: reset ? this.draftPid(existing.code || 'PR') : existing.pidRef,
      },
      include: include(),
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'PRESS_UPDATE',
      entityType: 'PressRelease',
      entityId: id,
      summary: `Press updated: ${p.code}${reset ? ' (returned to draft)' : ''}`,
    });
    return p;
  }

  private async notifyApprovers(press: { id: string; title: string; code: string | null }, from: string) {
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
          'PRESS',
          `Press for authorization · ${press.code || press.title}`,
          `${from} submitted bilingual release for PID / social review.`,
          press.id,
        ),
      ),
    );
  }

  async setStatus(
    id: string,
    actor: { id: string; role: Role },
    status: PressStatus | string,
    opts?: { reason?: string; socialApproved?: boolean },
  ) {
    const existing = await this.prisma.pressRelease.findUnique({
      where: { id },
      include: { author: { select: { displayName: true } } },
    });
    if (!existing) throw new NotFoundException('Press release not found');

    const next = (status || '').toUpperCase() as PressStatus;
    if (!Object.values(PressStatus).includes(next)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const canAuthorize =
      actor.role === Role.SPEAKER ||
      actor.role === Role.SECRETARY_GENERAL ||
      actor.role === Role.ADMIN;

    const from = existing.status;

    if (next === PressStatus.SUBMITTED) {
      if (from !== PressStatus.DRAFT && from !== PressStatus.REJECTED) {
        throw new BadRequestException('Only draft/rejected releases can be submitted');
      }
      if (existing.aiAssisted && !existing.humanReviewedAt) {
        throw new BadRequestException(
          'Mark human review complete before submitting AI-assisted copy (consultation §4)',
        );
      }
      if (!(existing.bodyUr || '').trim()) {
        throw new BadRequestException('Urdu version required before submit');
      }
    } else if (next === PressStatus.APPROVED) {
      if (!canAuthorize) throw new ForbiddenException('Not authorized to approve press');
      if (from !== PressStatus.SUBMITTED && from !== PressStatus.DRAFT) {
        throw new BadRequestException('Approve from submitted or draft only');
      }
      if (existing.aiAssisted && !existing.humanReviewedAt && from === PressStatus.SUBMITTED) {
        throw new BadRequestException('Human review required before approval');
      }
    } else if (next === PressStatus.REJECTED) {
      if (!canAuthorize) throw new ForbiddenException();
      if (from !== PressStatus.SUBMITTED) {
        throw new BadRequestException('Only submitted releases can be rejected');
      }
      if (!(opts?.reason || '').trim() || (opts?.reason || '').trim().length < 5) {
        throw new BadRequestException('Reject reason required (min 5 characters)');
      }
    } else if (next === PressStatus.DISPATCHED) {
      if (!canAuthorize) throw new ForbiddenException();
      if (from !== PressStatus.APPROVED) {
        throw new BadRequestException('Dispatch only after approval');
      }
      if (existing.embargoUntil && existing.embargoUntil > new Date()) {
        throw new BadRequestException(
          `Embargo active until ${existing.embargoUntil.toISOString()} — cannot dispatch yet`,
        );
      }
    } else if (next === PressStatus.DRAFT) {
      if (from !== PressStatus.REJECTED && from !== PressStatus.SUBMITTED) {
        throw new BadRequestException('Cannot move to draft from this status');
      }
    } else {
      throw new BadRequestException(`Transition ${from} → ${next} not allowed`);
    }

    const data: {
      status: PressStatus;
      approvedAt?: Date | null;
      dispatchedAt?: Date;
      pidRef?: string;
      socialApproved?: boolean;
      rejectReason?: string | null;
      humanReviewedAt?: Date;
    } = { status: next };

    if (next === PressStatus.APPROVED) {
      data.approvedAt = new Date();
      data.socialApproved =
        opts?.socialApproved !== undefined
          ? Boolean(opts.socialApproved)
          : existing.socialApproved;
      if (existing.pidRef?.includes('-DRAFT')) {
        data.pidRef = existing.pidRef.replace('-DRAFT', '');
      }
      if (!existing.humanReviewedAt) data.humanReviewedAt = new Date();
    }
    if (next === PressStatus.DISPATCHED) {
      data.dispatchedAt = new Date();
      data.approvedAt = existing.approvedAt || new Date();
      data.pidRef = existing.pidRef?.includes('PID(I)')
        ? existing.pidRef
        : this.livePid();
    }
    if (next === PressStatus.REJECTED) {
      data.rejectReason = opts!.reason!.trim().slice(0, 1000);
      data.approvedAt = null;
    }
    if (next === PressStatus.DRAFT || next === PressStatus.SUBMITTED) {
      data.rejectReason = null;
    }

    const p = await this.prisma.pressRelease.update({
      where: { id },
      data,
      include: include(),
    });

    if (next === PressStatus.SUBMITTED) {
      await this.notifyApprovers(p, existing.author.displayName);
    }
    if (
      next === PressStatus.APPROVED ||
      next === PressStatus.REJECTED ||
      next === PressStatus.DISPATCHED
    ) {
      await this.notifications.create(
        existing.authorId,
        'PRESS',
        `Press ${next.toLowerCase()} · ${p.code || p.title}`,
        next === PressStatus.REJECTED
          ? (opts?.reason || '').slice(0, 400)
          : next === PressStatus.DISPATCHED
            ? `Dispatched on wire · ${p.pidRef}`
            : 'Authorized for PID wire / social channels.',
        id,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'PRESS_STATUS',
      entityType: 'PressRelease',
      entityId: id,
      summary: `Press ${p.code || p.title} -> ${next}`,
    });
    return p;
  }

  listClips() {
    return this.prisma.mediaClip.findMany({
      orderBy: { observedAt: 'desc' },
      take: 100,
      include: {
        createdBy: { select: { displayName: true } },
        pressRelease: { select: { id: true, code: true, title: true } },
      },
    });
  }

  async addClip(
    createdById: string,
    data: {
      outlet: string;
      headline: string;
      url?: string;
      note?: string;
      platform?: string;
      pressReleaseId?: string;
      observedAt?: string;
    },
  ) {
    const outlet = (data.outlet || '').trim();
    const headline = (data.headline || '').trim();
    if (outlet.length < 2) throw new BadRequestException('Outlet required');
    if (headline.length < 5) throw new BadRequestException('Headline required');

    if (data.pressReleaseId) {
      const pr = await this.prisma.pressRelease.findUnique({
        where: { id: data.pressReleaseId },
      });
      if (!pr) throw new BadRequestException('Press release not found');
    }

    const clip = await this.prisma.mediaClip.create({
      data: {
        createdById,
        outlet,
        headline,
        url: data.url?.trim() || null,
        note: data.note?.trim() || null,
        platform: data.platform?.trim() || 'WIRE',
        pressReleaseId: data.pressReleaseId || null,
        observedAt: data.observedAt ? new Date(data.observedAt) : new Date(),
      },
      include: {
        createdBy: { select: { displayName: true } },
        pressRelease: { select: { id: true, code: true, title: true } },
      },
    });
    await this.audit.record({
      actorId: createdById,
      action: 'MEDIA_CLIP_ADD',
      entityType: 'MediaClip',
      entityId: clip.id,
      summary: `Media clip: ${outlet} · ${headline.slice(0, 60)}`,
    });
    return clip;
  }

  digest() {
    return this.prisma.pressRelease.findMany({
      where: { status: PressStatus.DISPATCHED },
      orderBy: { dispatchedAt: 'desc' },
      take: 20,
      include: {
        clips: { orderBy: { observedAt: 'desc' }, take: 5 },
        author: { select: { displayName: true } },
      },
    });
  }
}
