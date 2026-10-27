import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PressStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GREETING_OCCASIONS } from './occasions.data';

function include() {
  return {
    author: { select: { id: true, displayName: true, role: true } },
    matter: { select: { id: true, diaryNo: true, subject: true } },
  } as const;
}

@Injectable()
export class GreetingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  listOccasions() {
    return GREETING_OCCASIONS;
  }

  list(status?: string) {
    const where =
      status && Object.values(PressStatus).includes(status.toUpperCase() as PressStatus)
        ? { status: status.toUpperCase() as PressStatus }
        : undefined;
    return this.prisma.greetingCard.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: include(),
    });
  }

  async get(id: string) {
    const g = await this.prisma.greetingCard.findUnique({
      where: { id },
      include: include(),
    });
    if (!g) throw new NotFoundException('Greeting card not found');
    return g;
  }

  private async nextCardCode() {
    const year = new Date().getFullYear();
    const count = await this.prisma.greetingCard.count({
      where: { cardCode: { startsWith: `GC-${year}-` } },
    });
    return `GC-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  private async nextDispatchRef() {
    const year = new Date().getFullYear();
    const count = await this.prisma.greetingCard.count({
      where: { dispatchRef: { startsWith: `NA/SPK/GREET/${year}/` } },
    });
    return `NA/SPK/GREET/${year}/${String(count + 1).padStart(3, '0')}`;
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
      occasion: string;
      recipient: string;
      message: string;
      titleUr?: string;
      messageUr?: string;
      style?: string;
      channel?: string;
      recipientCount?: number;
      occasionKey?: string;
      occasionDate?: string;
      matterId?: string;
      sourcesNote?: string;
      deliveryNote?: string;
      aiAssisted?: boolean;
    },
  ) {
    const occasion = (data.occasion || '').trim();
    const recipient = (data.recipient || '').trim();
    const message = (data.message || '').trim();
    if (occasion.length < 3) throw new BadRequestException('Occasion required');
    if (recipient.length < 3) throw new BadRequestException('Recipient group required');
    if (message.length < 20) throw new BadRequestException('English message required (min 20 chars)');

    const matter = await this.assertMatter(data.matterId);
    const channel = (data.channel || 'PROTOCOL_ECARD').toUpperCase();
    if (!['PROTOCOL_ECARD', 'PRINT', 'BOTH'].includes(channel)) {
      throw new BadRequestException('channel must be PROTOCOL_ECARD, PRINT, or BOTH');
    }

    const g = await this.prisma.greetingCard.create({
      data: {
        authorId,
        occasion,
        recipient,
        message,
        titleUr: data.titleUr?.trim() || null,
        messageUr: data.messageUr?.trim() || null,
        style: data.style || 'STATE_GOLD',
        channel,
        recipientCount: Math.max(0, Number(data.recipientCount) || 0),
        occasionKey: data.occasionKey || null,
        occasionDate: data.occasionDate ? new Date(data.occasionDate) : null,
        matterId: matter?.id || null,
        sourcesNote:
          data.sourcesNote?.trim() ||
          (matter ? `Protocol file ${matter.diaryNo}: ${matter.subject}` : null),
        deliveryNote: data.deliveryNote?.trim() || null,
        aiAssisted: Boolean(data.aiAssisted),
        cardCode: await this.nextCardCode(),
        status: PressStatus.DRAFT,
      },
      include: include(),
    });
    await this.audit.record({
      actorId: authorId,
      action: 'GREETING_CREATE',
      entityType: 'GreetingCard',
      entityId: g.id,
      summary: `Greeting drafted: ${g.cardCode} · ${g.occasion}`,
    });
    return g;
  }

  async update(
    id: string,
    actor: { id: string; role: Role },
    data: {
      occasion?: string;
      recipient?: string;
      message?: string;
      titleUr?: string;
      messageUr?: string;
      style?: string;
      channel?: string;
      recipientCount?: number;
      occasionKey?: string;
      occasionDate?: string | null;
      matterId?: string | null;
      sourcesNote?: string;
      deliveryNote?: string;
      aiAssisted?: boolean;
      markHumanReviewed?: boolean;
    },
  ) {
    const existing = await this.prisma.greetingCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Greeting card not found');
    if (existing.status === PressStatus.DISPATCHED) {
      throw new BadRequestException('Dispatched cards cannot be edited');
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

    let channel = existing.channel;
    if (data.channel !== undefined) {
      channel = data.channel.toUpperCase();
      if (!['PROTOCOL_ECARD', 'PRINT', 'BOTH'].includes(channel)) {
        throw new BadRequestException('Invalid channel');
      }
    }

    const publishableChanged =
      (data.occasion !== undefined && data.occasion.trim() !== existing.occasion) ||
      (data.recipient !== undefined && data.recipient.trim() !== existing.recipient) ||
      (data.message !== undefined && data.message.trim() !== existing.message) ||
      (data.titleUr !== undefined && (data.titleUr.trim() || null) !== existing.titleUr) ||
      (data.messageUr !== undefined && (data.messageUr.trim() || null) !== existing.messageUr) ||
      (data.style !== undefined && data.style !== existing.style) ||
      (data.channel !== undefined && channel !== existing.channel);

    const reset =
      publishableChanged &&
      (existing.status === PressStatus.APPROVED ||
        existing.status === PressStatus.SUBMITTED);

    const g = await this.prisma.greetingCard.update({
      where: { id },
      data: {
        occasion: data.occasion?.trim() ?? existing.occasion,
        recipient: data.recipient?.trim() ?? existing.recipient,
        message: data.message?.trim() ?? existing.message,
        titleUr: data.titleUr !== undefined ? data.titleUr.trim() || null : existing.titleUr,
        messageUr:
          data.messageUr !== undefined ? data.messageUr.trim() || null : existing.messageUr,
        style: data.style ?? existing.style,
        channel,
        recipientCount:
          data.recipientCount !== undefined
            ? Math.max(0, Number(data.recipientCount) || 0)
            : existing.recipientCount,
        occasionKey:
          data.occasionKey !== undefined ? data.occasionKey || null : existing.occasionKey,
        occasionDate:
          data.occasionDate === undefined
            ? existing.occasionDate
            : data.occasionDate
              ? new Date(data.occasionDate)
              : null,
        matterId,
        sourcesNote:
          data.sourcesNote !== undefined
            ? data.sourcesNote.trim() || null
            : existing.sourcesNote,
        deliveryNote:
          data.deliveryNote !== undefined
            ? data.deliveryNote.trim() || null
            : existing.deliveryNote,
        aiAssisted:
          data.aiAssisted !== undefined ? Boolean(data.aiAssisted) : existing.aiAssisted,
        humanReviewedAt: data.markHumanReviewed ? new Date() : existing.humanReviewedAt,
        approvedAt: reset ? null : existing.approvedAt,
        rejectReason: reset ? null : existing.rejectReason,
        status: reset ? PressStatus.DRAFT : existing.status,
      },
      include: include(),
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'GREETING_UPDATE',
      entityType: 'GreetingCard',
      entityId: id,
      summary: `Greeting updated: ${g.cardCode}${reset ? ' (returned to draft)' : ''}`,
    });
    return g;
  }

  private async notifyApprovers(
    card: { id: string; occasion: string; cardCode: string | null },
    from: string,
  ) {
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
          'GREETING',
          `Greeting for authorization · ${card.cardCode || card.occasion}`,
          `${from} submitted protocol felicitation for Speaker seal.`,
          card.id,
        ),
      ),
    );
  }

  async setStatus(
    id: string,
    actor: { id: string; role: Role },
    status: PressStatus | string,
    opts?: { reason?: string; deliveryNote?: string },
  ) {
    const existing = await this.prisma.greetingCard.findUnique({
      where: { id },
      include: { author: { select: { displayName: true } } },
    });
    if (!existing) throw new NotFoundException('Greeting card not found');

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
        throw new BadRequestException('Only draft/rejected cards can be submitted');
      }
      if (existing.aiAssisted && !existing.humanReviewedAt) {
        throw new BadRequestException(
          'Mark human review complete before submitting AI-assisted felicitations',
        );
      }
      if (!(existing.messageUr || '').trim()) {
        throw new BadRequestException('Urdu felicitation required before submit');
      }
    } else if (next === PressStatus.APPROVED) {
      if (!canAuthorize) throw new ForbiddenException('Not authorized to approve greetings');
      if (from !== PressStatus.SUBMITTED && from !== PressStatus.DRAFT) {
        throw new BadRequestException('Approve from submitted or draft only');
      }
      if (existing.aiAssisted && !existing.humanReviewedAt && from === PressStatus.SUBMITTED) {
        throw new BadRequestException('Human review required before approval');
      }
    } else if (next === PressStatus.REJECTED) {
      if (!canAuthorize) throw new ForbiddenException();
      if (from !== PressStatus.SUBMITTED) {
        throw new BadRequestException('Only submitted cards can be rejected');
      }
      if (!(opts?.reason || '').trim() || (opts?.reason || '').trim().length < 5) {
        throw new BadRequestException('Reject reason required (min 5 characters)');
      }
    } else if (next === PressStatus.DISPATCHED) {
      if (!canAuthorize) throw new ForbiddenException();
      if (from !== PressStatus.APPROVED) {
        throw new BadRequestException('Dispatch only after approval');
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
      dispatchRef?: string;
      rejectReason?: string | null;
      deliveryNote?: string | null;
      humanReviewedAt?: Date;
    } = { status: next };

    if (next === PressStatus.APPROVED) {
      data.approvedAt = new Date();
      if (!existing.humanReviewedAt) data.humanReviewedAt = new Date();
    }
    if (next === PressStatus.DISPATCHED) {
      data.dispatchedAt = new Date();
      data.approvedAt = existing.approvedAt || new Date();
      data.dispatchRef = existing.dispatchRef || (await this.nextDispatchRef());
      if (opts?.deliveryNote) data.deliveryNote = opts.deliveryNote.trim().slice(0, 1000);
    }
    if (next === PressStatus.REJECTED) {
      data.rejectReason = opts!.reason!.trim().slice(0, 1000);
      data.approvedAt = null;
    }
    if (next === PressStatus.DRAFT || next === PressStatus.SUBMITTED) {
      data.rejectReason = null;
    }

    const g = await this.prisma.greetingCard.update({
      where: { id },
      data,
      include: include(),
    });

    if (next === PressStatus.SUBMITTED) {
      await this.notifyApprovers(g, existing.author.displayName);
    }
    if (
      next === PressStatus.APPROVED ||
      next === PressStatus.REJECTED ||
      next === PressStatus.DISPATCHED
    ) {
      await this.notifications.create(
        existing.authorId,
        'GREETING',
        `Greeting ${next.toLowerCase()} · ${g.cardCode || g.occasion}`,
        next === PressStatus.REJECTED
          ? (opts?.reason || '').slice(0, 400)
          : next === PressStatus.DISPATCHED
            ? `Dispatched · ${g.dispatchRef} · ${g.recipientCount} recipients`
            : 'Authorized for protocol dispatch.',
        id,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'GREETING_STATUS',
      entityType: 'GreetingCard',
      entityId: id,
      summary: `Greeting ${g.cardCode || g.occasion} -> ${next}`,
    });
    return g;
  }
}
