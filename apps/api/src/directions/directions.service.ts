import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DirectionStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000; // due within 24h

@Injectable()
export class DirectionsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.markOverdue().catch(() => undefined);
      this.sendDueReminders().catch(() => undefined);
    }, 5 * 60_000);
    void this.markOverdue();
    void this.sendDueReminders();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async markOverdue() {
    const now = new Date();
    const result = await this.prisma.direction.updateMany({
      where: {
        dueDate: { lt: now },
        status: {
          in: [
            DirectionStatus.ISSUED,
            DirectionStatus.IN_PROGRESS,
            DirectionStatus.RETURNED,
            DirectionStatus.EVIDENCE_SUBMITTED,
          ],
        },
      },
      data: { status: DirectionStatus.OVERDUE },
    });
    return result.count;
  }

  /** Notify owners of directions due within 24h (once). */
  async sendDueReminders() {
    const now = new Date();
    const until = new Date(now.getTime() + REMINDER_WINDOW_MS);
    const dueSoon = await this.prisma.direction.findMany({
      where: {
        reminderSentAt: null,
        dueDate: { gte: now, lte: until },
        status: {
          in: [DirectionStatus.ISSUED, DirectionStatus.IN_PROGRESS, DirectionStatus.RETURNED],
        },
      },
      take: 100,
    });

    let sent = 0;
    for (const d of dueSoon) {
      await this.notifications.create(
        d.ownerId,
        'DIRECTION',
        'Direction due soon',
        `"${d.title}" is due by ${d.dueDate?.toLocaleString() || 'soon'}. Submit evidence before the deadline.`,
        d.id,
      );
      await this.prisma.direction.update({
        where: { id: d.id },
        data: { reminderSentAt: now },
      });
      await this.audit.record({
        actorId: d.ownerId,
        action: 'DIRECTION_REMINDER',
        entityType: 'Direction',
        entityId: d.id,
        summary: `Due-date reminder: ${d.title}`,
      });
      sent += 1;
    }
    return sent;
  }

  list(user: { id: string; role: Role }) {
    const where =
      user.role === Role.SPEAKER || user.role === Role.ADMIN
        ? {}
        : { ownerId: user.id };
    return this.prisma.direction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, displayName: true, role: true } },
        createdBy: { select: { id: true, displayName: true, role: true } },
        matter: { select: { id: true, diaryNo: true, subject: true } },
        meetingActions: {
          select: { id: true, meetingId: true, title: true },
          take: 1,
        },
      },
    });
  }

  async activity(id: string) {
    return this.prisma.auditEvent.findMany({
      where: { entityType: 'Direction', entityId: id },
      orderBy: { seq: 'desc' },
      take: 30,
      include: {
        actor: { select: { displayName: true, role: true } },
      },
    });
  }

  async start(id: string, userId: string) {
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    if (d.ownerId !== userId) throw new ForbiddenException();
    const updated = await this.prisma.direction.update({
      where: { id },
      data: { status: DirectionStatus.IN_PROGRESS },
    });
    await this.audit.record({
      actorId: userId,
      action: 'DIRECTION_START',
      entityType: 'Direction',
      entityId: id,
      summary: `Started direction: ${d.title}`,
    });
    return updated;
  }

  async evidence(id: string, userId: string, evidence: string) {
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d || d.ownerId !== userId) throw new ForbiddenException();
    const updated = await this.prisma.direction.update({
      where: { id },
      data: { evidence, status: DirectionStatus.EVIDENCE_SUBMITTED },
    });
    await this.audit.record({
      actorId: userId,
      action: 'DIRECTION_EVIDENCE',
      entityType: 'Direction',
      entityId: id,
      summary: `Evidence submitted for: ${d.title}`,
    });
    return updated;
  }

  async verify(id: string, actorId: string, approve: boolean) {
    const status = approve ? DirectionStatus.CLOSED : DirectionStatus.RETURNED;
    const d = await this.prisma.direction.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorId,
      action: approve ? 'DIRECTION_VERIFY' : 'DIRECTION_RETURN',
      entityType: 'Direction',
      entityId: id,
      summary: `${approve ? 'Verified' : 'Returned'} direction ${d.title}`,
    });
    return d;
  }

  async escalate(
    id: string,
    user: { id: string; role: Role },
    note: string,
  ) {
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    const isOwner = d.ownerId === user.id;
    const isSpeaker = user.role === Role.SPEAKER || user.role === Role.ADMIN;
    if (!isOwner && !isSpeaker) throw new ForbiddenException();
    const updated = await this.prisma.direction.update({
      where: { id },
      data: {
        status: DirectionStatus.ESCALATED,
        escalateNote: note || 'Escalated for Speaker review',
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'DIRECTION_ESCALATE',
      entityType: 'Direction',
      entityId: id,
      summary: `Escalated direction: ${d.title}`,
    });
    return updated;
  }
}
