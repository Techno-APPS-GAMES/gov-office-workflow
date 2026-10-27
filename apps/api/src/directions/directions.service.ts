import {
  BadRequestException,
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
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { scanUpload } from '../storage/virus-scan.hook';

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000; // due within 24h

@Injectable()
export class DirectionsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private storage: StorageService,
    private crypto: CryptoService,
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

  private async journeyOnMatter(
    matterId: string | null | undefined,
    kind: string,
    summary: string,
    actorId?: string,
  ) {
    if (!matterId) return;
    await this.prisma.journeyEvent.create({
      data: { matterId, kind, summary, actorId },
    });
  }

  async markOverdue() {
    const now = new Date();
    const result = await this.prisma.direction.updateMany({
      where: {
        dueDate: { lt: now },
        status: {
          // Do not clobber EVIDENCE_SUBMITTED — Speaker must still be able to verify.
          in: [
            DirectionStatus.ISSUED,
            DirectionStatus.IN_PROGRESS,
            DirectionStatus.RETURNED,
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

  async list(user: { id: string; role: Role }) {
    const where =
      user.role === Role.SPEAKER || user.role === Role.ADMIN
        ? {}
        : { ownerId: user.id };
    const rows = await this.prisma.direction.findMany({
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
    return rows.map(({ evidenceStorageKey: _key, evidenceSha256: _hash, ...rest }) => ({
      ...rest,
      hasEvidenceFile: Boolean(_key),
    }));
  }

  async activity(id: string, user: { id: string; role: Role }) {
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    const ok =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      d.ownerId === user.id ||
      d.createdById === user.id;
    if (!ok) throw new ForbiddenException();
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
    if (
      d.status !== DirectionStatus.ISSUED &&
      d.status !== DirectionStatus.RETURNED
    ) {
      throw new BadRequestException(
        'Only issued or returned directions can be resumed to in progress',
      );
    }
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
    await this.journeyOnMatter(
      d.matterId,
      'DIRECTION_START',
      `Direction started: ${d.title}`,
      userId,
    );
    return updated;
  }

  async evidence(
    id: string,
    userId: string,
    evidenceText: string,
    file?: Express.Multer.File,
  ) {
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d || d.ownerId !== userId) throw new ForbiddenException();
    const text = (evidenceText || '').trim();
    if (text.length < 3) {
      throw new BadRequestException('Evidence description is required');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Evidence file attachment is required');
    }
    const scan = await scanUpload(file.buffer, file.originalname);
    if (!scan.clean) {
      throw new BadRequestException(`Upload rejected by virus scan (${scan.engine})`);
    }
    const sha256 = this.crypto.sha256(file.buffer);
    const storageKey = await this.storage.putObject(
      file.buffer,
      file.mimetype || 'application/octet-stream',
      'direction-evidence',
    );
    const updated = await this.prisma.direction.update({
      where: { id },
      data: {
        evidence: text,
        status: DirectionStatus.EVIDENCE_SUBMITTED,
        evidenceFileName: file.originalname,
        evidenceContentType: file.mimetype || 'application/octet-stream',
        evidenceSizeBytes: file.size,
        evidenceStorageKey: storageKey,
        evidenceSha256: sha256,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'DIRECTION_EVIDENCE',
      entityType: 'Direction',
      entityId: id,
      summary: `Evidence submitted for: ${d.title} (${file.originalname})`,
    });
    await this.journeyOnMatter(
      d.matterId,
      'DIRECTION_EVIDENCE',
      `Evidence submitted: ${file.originalname}`,
      userId,
    );
    if (d.createdById !== userId) {
      await this.notifications.create(
        d.createdById,
        'direction',
        'Evidence submitted',
        `"${d.title}" awaits your review`,
        d.id,
      );
    }
    return updated;
  }

  async downloadEvidence(id: string, user: { id: string; role: Role }) {
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    const isOwner = d.ownerId === user.id;
    const isSpeaker = user.role === Role.SPEAKER || user.role === Role.ADMIN;
    if (!isOwner && !isSpeaker) throw new ForbiddenException();
    if (!d.evidenceStorageKey || !d.evidenceFileName) {
      throw new NotFoundException('No evidence file on this direction');
    }
    const bytes = await this.storage.getObject(d.evidenceStorageKey);
    await this.audit.record({
      actorId: user.id,
      action: 'DIRECTION_EVIDENCE_DOWNLOAD',
      entityType: 'Direction',
      entityId: id,
      summary: `Downloaded evidence ${d.evidenceFileName}`,
    });
    return {
      bytes,
      fileName: d.evidenceFileName,
      contentType: d.evidenceContentType || 'application/octet-stream',
    };
  }

  async verify(id: string, actorId: string, approve: boolean) {
    if (typeof approve !== 'boolean') {
      throw new BadRequestException('approve must be true or false');
    }
    const existing = await this.prisma.direction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (existing.status !== DirectionStatus.EVIDENCE_SUBMITTED) {
      throw new BadRequestException(
        `Direction is ${existing.status}; only EVIDENCE_SUBMITTED can be verified`,
      );
    }
    if (approve) {
      const hasEvidence =
        Boolean(existing.evidence?.trim()) || Boolean(existing.evidenceStorageKey);
      if (!hasEvidence) {
        throw new BadRequestException('Cannot approve without evidence text or file');
      }
    }
    const status = approve ? DirectionStatus.CLOSED : DirectionStatus.RETURNED;
    const d = await this.prisma.direction.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorId,
      action: approve ? 'DIRECTION_VERIFY' : 'DIRECTION_RETURN',
      entityType: 'Direction',
      entityId: id,
      summary: `${approve ? 'Verified' : 'Returned'} direction ${d.title}`,
    });
    await this.journeyOnMatter(
      d.matterId,
      approve ? 'DIRECTION_CLOSED' : 'DIRECTION_RETURNED',
      `${approve ? 'Direction verified & closed' : 'Direction returned'}: ${d.title}`,
      actorId,
    );
    if (!approve && d.ownerId !== actorId) {
      await this.notifications.create(
        d.ownerId,
        'direction',
        'Direction returned',
        `"${d.title}" was returned for more work`,
        d.id,
      );
    }
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
    await this.journeyOnMatter(
      d.matterId,
      'DIRECTION_ESCALATED',
      `Direction escalated: ${d.title}`,
      user.id,
    );
    return updated;
  }

  async extendDue(
    id: string,
    user: { id: string; role: Role },
    dueDate: string,
  ) {
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    const isSpeaker = user.role === Role.SPEAKER || user.role === Role.ADMIN;
    const isOwner = d.ownerId === user.id;
    const allowed: DirectionStatus[] = [
      DirectionStatus.RETURNED,
      DirectionStatus.ESCALATED,
      DirectionStatus.OVERDUE,
      DirectionStatus.IN_PROGRESS,
    ];
    if (!allowed.includes(d.status)) {
      throw new BadRequestException(`Cannot extend due date while ${d.status}`);
    }
    if (!isSpeaker && !(isOwner && d.status === DirectionStatus.RETURNED)) {
      throw new ForbiddenException();
    }
    const next = new Date(dueDate);
    if (Number.isNaN(next.getTime())) {
      throw new BadRequestException('Invalid due date');
    }
    const status =
      d.status === DirectionStatus.OVERDUE ? DirectionStatus.IN_PROGRESS : d.status;
    const updated = await this.prisma.direction.update({
      where: { id },
      data: { dueDate: next, status, reminderSentAt: null },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'DIRECTION_EXTEND_DUE',
      entityType: 'Direction',
      entityId: id,
      summary: `Due date extended to ${next.toISOString().slice(0, 10)}: ${d.title}`,
    });
    return updated;
  }

  async reassign(
    id: string,
    user: { id: string; role: Role },
    ownerId: string,
  ) {
    if (user.role !== Role.SPEAKER && user.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    const allowed: DirectionStatus[] = [
      DirectionStatus.RETURNED,
      DirectionStatus.ESCALATED,
      DirectionStatus.OVERDUE,
      DirectionStatus.IN_PROGRESS,
    ];
    if (!allowed.includes(d.status)) {
      throw new BadRequestException(`Cannot reassign while ${d.status}`);
    }
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner?.active) throw new BadRequestException('Owner not found or inactive');
    const updated = await this.prisma.direction.update({
      where: { id },
      data: { ownerId },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'DIRECTION_REASSIGN',
      entityType: 'Direction',
      entityId: id,
      summary: `Reassigned "${d.title}" to ${owner.displayName}`,
    });
    if (ownerId !== d.ownerId) {
      await this.notifications.create(
        ownerId,
        'direction',
        'Direction assigned to you',
        `"${d.title}" was reassigned to you`,
        id,
      );
    }
    return updated;
  }

  async clearEscalated(
    id: string,
    user: { id: string; role: Role },
    note: string,
  ) {
    if (user.role !== Role.SPEAKER && user.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }
    const d = await this.prisma.direction.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    if (d.status !== DirectionStatus.ESCALATED) {
      throw new BadRequestException('Only escalated directions can be cleared');
    }
    const text = (note || '').trim();
    if (text.length < 5) {
      throw new BadRequestException('Note required (min 5 characters)');
    }
    const updated = await this.prisma.direction.update({
      where: { id },
      data: { status: DirectionStatus.IN_PROGRESS },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'DIRECTION_CLEAR_ESCALATION',
      entityType: 'Direction',
      entityId: id,
      summary: `Escalation cleared: ${d.title} — ${text.slice(0, 120)}`,
    });
    await this.journeyOnMatter(
      d.matterId,
      'DIRECTION_CLEAR_ESCALATION',
      `Escalation cleared: ${d.title}`,
      user.id,
    );
    if (d.ownerId !== user.id) {
      await this.notifications.create(
        d.ownerId,
        'direction',
        'Escalation cleared',
        `"${d.title}" returned to in progress. ${text.slice(0, 120)}`,
        id,
      );
    }
    return updated;
  }
}
