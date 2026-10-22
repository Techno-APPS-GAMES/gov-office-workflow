import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Classification, Role, WorkItemStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { workItemVisibilityWhere } from '../auth/access';
import { NotificationsService } from '../notifications/notifications.service';

const KINDS = [
  'PARLIAMENTARY',
  'BRIEF',
  'SPEECH',
  'CORRESPONDENCE',
  'MEDIA',
  'LEGISLATIVE',
  'QUESTION',
  'HANSARD',
] as const;

function include() {
  return {
    owner: { select: { id: true, displayName: true, role: true } },
    createdBy: { select: { id: true, displayName: true, role: true } },
    decidedBy: { select: { id: true, displayName: true, role: true } },
    matter: { select: { id: true, diaryNo: true, subject: true, status: true } },
  } as const;
}

@Injectable()
export class WorkItemsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private canSee(
    user: { id: string; role: Role },
    item: { ownerId: string; createdById: string; classification: Classification },
  ) {
    if (item.classification === Classification.CONFIDENTIAL) {
      return (
        user.role === Role.SPEAKER ||
        user.role === Role.ADMIN ||
        item.ownerId === user.id
      );
    }
    if (user.role === Role.SPEAKER || user.role === Role.ADMIN || user.role === Role.SECRETARY_GENERAL) {
      return true;
    }
    return item.ownerId === user.id || item.createdById === user.id;
  }

  private canEditConfidential(user: { id: string; role: Role }, ownerId: string) {
    return user.role === Role.ADMIN || ownerId === user.id;
  }

  private async nextCode(tx: Pick<PrismaService, 'workItem' | '$executeRawUnsafe'>) {
    const year = new Date().getFullYear();
    const prefix = `WR-${year}-`;
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(87201402)`);
    const count = await tx.workItem.count({
      where: { code: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(3, '0')}`;
  }

  private async assertMatter(matterId?: string | null) {
    if (!matterId) return null;
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter) throw new BadRequestException('Linked matter not found');
    return matter;
  }

  list(
    user: { id: string; role: Role },
    opts?: { status?: string; kind?: string },
  ) {
    const where: Record<string, unknown> = { ...workItemVisibilityWhere(user) };
    if (opts?.status) {
      const s = opts.status.toUpperCase();
      if (Object.values(WorkItemStatus).includes(s as WorkItemStatus)) {
        where.status = s as WorkItemStatus;
      }
    }
    if (opts?.kind) {
      where.kind = opts.kind.toUpperCase();
    }
    return this.prisma.workItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: include(),
    });
  }

  async get(id: string, user: { id: string; role: Role }) {
    const item = await this.prisma.workItem.findUnique({
      where: { id },
      include: include(),
    });
    if (!item) throw new NotFoundException('Work record not found');
    if (!this.canSee(user, item)) throw new ForbiddenException();
    return item;
  }

  async create(
    userId: string,
    data: {
      title: string;
      kind: string;
      text: string;
      language?: string;
      classification?: Classification;
      priority?: string;
      ownerId?: string;
      matterId?: string;
      dueAt?: string;
    },
  ) {
    const title = (data.title || '').trim();
    const text = (data.text || '').trim();
    const kind = (data.kind || '').trim().toUpperCase();
    if (title.length < 3) throw new BadRequestException('Title required (min 3 chars)');
    if (text.length < 10) throw new BadRequestException('Body text required (min 10 chars)');
    if (!KINDS.includes(kind as (typeof KINDS)[number])) {
      throw new BadRequestException(`kind must be one of: ${KINDS.join(', ')}`);
    }
    await this.assertMatter(data.matterId);

    const priority = (data.priority || 'NORMAL').toUpperCase();
    if (!['NORMAL', 'PRIORITY', 'URGENT', 'VIP'].includes(priority)) {
      throw new BadRequestException('priority must be NORMAL, PRIORITY, URGENT, or VIP');
    }

    let dueAt: Date | null = null;
    if (data.dueAt) {
      dueAt = new Date(data.dueAt);
      if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('Invalid dueAt');
    }

    const item = await this.prisma.$transaction(async (tx) => {
      const code = await this.nextCode(tx);
      return tx.workItem.create({
        data: {
          code,
          title,
          kind,
          text,
          language: data.language === 'ur' ? 'ur' : 'en',
          classification: data.classification || Classification.INTERNAL,
          priority,
          ownerId: data.ownerId || userId,
          createdById: userId,
          matterId: data.matterId || null,
          dueAt,
        },
        include: include(),
      });
    });

    await this.audit.record({
      actorId: userId,
      action: 'WORK_CREATE',
      entityType: 'WorkItem',
      entityId: item.id,
      summary: `Work record drafted: ${item.code || item.title}`,
    });
    return item;
  }

  async update(
    id: string,
    user: { id: string; role: Role },
    data: {
      title?: string;
      kind?: string;
      text?: string;
      language?: string;
      classification?: Classification;
      priority?: string;
      ownerId?: string;
      matterId?: string | null;
      dueAt?: string | null;
    },
  ) {
    const existing = await this.prisma.workItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Work record not found');
    if (!this.canSee(user, existing)) throw new ForbiddenException();
    const classification = data.classification ?? existing.classification;
    if (
      classification === Classification.CONFIDENTIAL &&
      !this.canEditConfidential(user, existing.ownerId)
    ) {
      throw new ForbiddenException('Confidential work records can only be edited by the owner or an admin');
    }
    if (existing.status !== WorkItemStatus.DRAFT && existing.status !== WorkItemStatus.REJECTED) {
      throw new BadRequestException('Only draft or rejected records can be edited');
    }

    if (data.matterId !== undefined) await this.assertMatter(data.matterId);

    let kind = existing.kind;
    if (data.kind) {
      kind = data.kind.trim().toUpperCase();
      if (!KINDS.includes(kind as (typeof KINDS)[number])) {
        throw new BadRequestException(`kind must be one of: ${KINDS.join(', ')}`);
      }
    }

    let priority = existing.priority;
    if (data.priority) {
      priority = data.priority.toUpperCase();
      if (!['NORMAL', 'PRIORITY', 'URGENT', 'VIP'].includes(priority)) {
        throw new BadRequestException('Invalid priority');
      }
    }

    let dueAt = existing.dueAt;
    if (data.dueAt === null) dueAt = null;
    else if (data.dueAt) {
      dueAt = new Date(data.dueAt);
      if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('Invalid dueAt');
    }

    const item = await this.prisma.workItem.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title.trim() : undefined,
        kind,
        text: data.text !== undefined ? data.text.trim() : undefined,
        language: data.language === 'ur' ? 'ur' : data.language === 'en' ? 'en' : undefined,
        classification: data.classification,
        priority,
        ownerId: data.ownerId,
        matterId: data.matterId === undefined ? undefined : data.matterId,
        dueAt,
        status: existing.status === WorkItemStatus.REJECTED ? WorkItemStatus.DRAFT : undefined,
        rejectReason: existing.status === WorkItemStatus.REJECTED ? null : undefined,
        decisionNote: existing.status === WorkItemStatus.REJECTED ? null : undefined,
        decidedAt: existing.status === WorkItemStatus.REJECTED ? null : undefined,
        decidedById: existing.status === WorkItemStatus.REJECTED ? null : undefined,
      },
      include: include(),
    });

    await this.audit.record({
      actorId: user.id,
      action: 'WORK_UPDATE',
      entityType: 'WorkItem',
      entityId: id,
      summary: `Updated work record ${item.code || item.title}`,
    });
    return item;
  }

  async submit(id: string, user: { id: string; role: Role }) {
    const item = await this.prisma.workItem.findUnique({
      where: { id },
      include: { owner: { select: { displayName: true } } },
    });
    if (!item) throw new NotFoundException('Work record not found');
    if (item.ownerId !== user.id && item.createdById !== user.id) {
      throw new ForbiddenException();
    }
    if (item.status !== WorkItemStatus.DRAFT && item.status !== WorkItemStatus.REJECTED) {
      throw new BadRequestException('Only draft or rejected records can be submitted');
    }

    const updated = await this.prisma.workItem.update({
      where: { id },
      data: {
        status: WorkItemStatus.SUBMITTED,
        rejectReason: null,
        decisionNote: null,
        decidedAt: null,
        decidedById: null,
      },
      include: include(),
    });

    const approvers = await this.prisma.user.findMany({
      where: {
        active: true,
        role: { in: [Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN] },
      },
      select: { id: true },
    });
    for (const u of approvers) {
      if (u.id === user.id) continue;
      await this.notifications.create(
        u.id,
        'WORK',
        `Work record for approval · ${updated.code || updated.title}`,
        `${item.owner.displayName} submitted ${updated.kind}`,
        id,
      );
    }

    await this.audit.record({
      actorId: user.id,
      action: 'WORK_SUBMIT',
      entityType: 'WorkItem',
      entityId: id,
      summary: `Submitted work record ${updated.code || updated.title}`,
    });
    return updated;
  }

  async decide(
    id: string,
    actor: { id: string; role: Role },
    opts: { approve: boolean; reason?: string; note?: string },
  ) {
    const existing = await this.prisma.workItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Work record not found');

    const canDecide =
      actor.role === Role.SPEAKER ||
      actor.role === Role.SECRETARY_GENERAL ||
      actor.role === Role.ADMIN;
    if (!canDecide) throw new ForbiddenException();

    if (opts.approve) {
      if (
        existing.status !== WorkItemStatus.SUBMITTED &&
        existing.status !== WorkItemStatus.DRAFT
      ) {
        throw new BadRequestException('Approve from submitted (or draft for direct authorize)');
      }
    } else {
      if (existing.status !== WorkItemStatus.SUBMITTED) {
        throw new BadRequestException('Only submitted records can be rejected');
      }
      const reason = (opts.reason || '').trim();
      if (reason.length < 5) {
        throw new BadRequestException('Reject reason required (min 5 characters)');
      }
    }

    const status = opts.approve ? WorkItemStatus.APPROVED : WorkItemStatus.REJECTED;
    const item = await this.prisma.workItem.update({
      where: { id },
      data: {
        status,
        rejectReason: opts.approve ? null : (opts.reason || '').trim().slice(0, 1000),
        decisionNote: (opts.note || '').trim().slice(0, 1000) || null,
        decidedAt: new Date(),
        decidedById: actor.id,
      },
      include: include(),
    });

    const notifyIds = new Set([existing.ownerId, existing.createdById]);
    notifyIds.delete(actor.id);
    for (const uid of notifyIds) {
      await this.notifications.create(
        uid,
        'WORK',
        `Work record ${opts.approve ? 'approved' : 'rejected'} · ${item.code || item.title}`,
        opts.approve
          ? (opts.note || 'Authorized').slice(0, 200)
          : (opts.reason || 'Rejected').slice(0, 200),
        id,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: opts.approve ? 'WORK_APPROVE' : 'WORK_REJECT',
      entityType: 'WorkItem',
      entityId: id,
      summary: `${opts.approve ? 'Approved' : 'Rejected'} work record ${item.code || item.title}`,
    });
    return item;
  }
}
