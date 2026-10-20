import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DirectionStatus, MeetingStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ScheduleService } from '../schedule/schedule.service';

@Injectable()
export class MeetingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private schedule: ScheduleService,
  ) {}

  list(user: { id: string; role: Role }) {
    const canSeeAll =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL ||
      user.role === Role.SPECIAL_SECRETARY;
    return this.prisma.meeting.findMany({
      where: {
        archived: false,
        ...(canSeeAll ? {} : { createdById: user.id }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { displayName: true } },
        actions: {
          include: {
            direction: { select: { id: true, status: true, title: true } },
            owner: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async create(
    userId: string,
    data: {
      title: string;
      startAt?: string;
      endAt?: string;
      location?: string;
      brief?: string;
      screeningStatus?: string;
      screeningCnic?: string;
      screeningBadge?: string;
      screeningNotes?: string;
      force?: boolean;
    },
  ) {
    let conflictPayload: {
      conflict: boolean;
      conflicts: { id: string; source: string; title: string; startAt: string; endAt: string }[];
      alternatives: { startAt: string; endAt: string; label: string }[];
    } | null = null;
    if (data.startAt && data.endAt) {
      const speaker = await this.prisma.user.findFirst({
        where: { role: Role.SPEAKER, active: true },
        select: { id: true },
      });
      const ownerId = speaker?.id || userId;
      const startAt = new Date(data.startAt);
      const endAt = new Date(data.endAt);
      const conflicts = await this.schedule.findConflicts(ownerId, startAt, endAt);
      const alternatives =
        conflicts.length > 0
          ? await this.schedule.suggestAlternatives(ownerId, startAt, endAt)
          : [];
      conflictPayload = {
        conflict: conflicts.length > 0,
        conflicts: conflicts.map((c) => ({
          id: c.id,
          source: c.source,
          title: c.title,
          startAt: c.startAt.toISOString(),
          endAt: c.endAt.toISOString(),
        })),
        alternatives,
      };
      if (conflictPayload.conflict && !data.force) {
        return {
          meeting: null,
          ...conflictPayload,
        };
      }
    }

    const meeting = await this.prisma.meeting.create({
      data: {
        title: data.title,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        location: data.location,
        brief: data.brief,
        screeningStatus: data.screeningStatus,
        screeningCnic: data.screeningCnic,
        screeningBadge: data.screeningBadge,
        screeningNotes: data.screeningNotes,
        createdById: userId,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'MEETING_CREATE',
      entityType: 'Meeting',
      entityId: meeting.id,
      summary: `Meeting requested: ${meeting.title}`,
    });
    return {
      meeting,
      conflict: conflictPayload?.conflict || false,
      conflicts: conflictPayload?.conflicts || [],
      alternatives: conflictPayload?.alternatives || [],
    };
  }

  async decide(id: string, actorId: string, approve: boolean) {
    const status = approve ? MeetingStatus.APPROVED : MeetingStatus.DECLINED;
    const m = await this.prisma.meeting.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorId,
      action: approve ? 'MEETING_APPROVE' : 'MEETING_DECLINE',
      entityType: 'Meeting',
      entityId: id,
      summary: `${approve ? 'Approved' : 'Declined'} meeting ${m.title}`,
    });
    return m;
  }

  async complete(
    id: string,
    data: { minutes?: string; outcome?: string; decision?: string },
    user: { id: string; role: Role },
  ) {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException();
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        status: MeetingStatus.COMPLETED,
        minutes: data.minutes,
        outcome: data.outcome,
        decision: data.decision,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'MEETING_COMPLETE',
      entityType: 'Meeting',
      entityId: id,
      summary: `Completed meeting: ${m.title}`,
    });
    return updated;
  }

  async addAction(
    meetingId: string,
    actor: { id: string; role: Role },
    data: {
      title: string;
      ownerName: string;
      ownerId?: string;
      dueDate?: string;
      promoteToDirection?: boolean;
    },
  ) {
    const m = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!m) throw new NotFoundException();

    let ownerId = data.ownerId || null;
    let ownerName = data.ownerName;
    if (ownerId) {
      const u = await this.prisma.user.findUnique({ where: { id: ownerId } });
      if (!u) throw new BadRequestException('Owner user not found');
      ownerName = u.displayName;
    } else if (data.ownerName?.trim()) {
      const match = await this.prisma.user.findFirst({
        where: {
          active: true,
          OR: [
            { displayName: { equals: data.ownerName.trim(), mode: 'insensitive' } },
            { username: { equals: data.ownerName.trim(), mode: 'insensitive' } },
          ],
        },
      });
      if (match) {
        ownerId = match.id;
        ownerName = match.displayName;
      }
    }

    const action = await this.prisma.meetingAction.create({
      data: {
        meetingId,
        title: data.title,
        ownerName,
        ownerId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'MEETING_ACTION_ADD',
      entityType: 'Meeting',
      entityId: meetingId,
      summary: `Action point: ${data.title}`,
    });

    if (data.promoteToDirection) {
      return this.promoteActionToDirection(action.id, actor, {
        ownerId: ownerId || undefined,
        dueDate: data.dueDate,
      });
    }

    return { action, direction: null };
  }

  async promoteActionToDirection(
    actionId: string,
    actor: { id: string; role: Role },
    opts?: { ownerId?: string; dueDate?: string },
  ) {
    const action = await this.prisma.meetingAction.findUnique({
      where: { id: actionId },
      include: { meeting: true, direction: true },
    });
    if (!action) throw new NotFoundException('Action not found');
    if (action.directionId && action.direction) {
      return { action, direction: action.direction };
    }

    let ownerId = opts?.ownerId || action.ownerId;
    if (!ownerId) {
      const match = await this.prisma.user.findFirst({
        where: {
          active: true,
          OR: [
            { displayName: { equals: action.ownerName, mode: 'insensitive' } },
            { username: { equals: action.ownerName, mode: 'insensitive' } },
          ],
        },
      });
      ownerId = match?.id ?? null;
    }
    if (!ownerId) {
      throw new BadRequestException(
        'Cannot promote action: resolve ownerId (or match ownerName to a user)',
      );
    }

    const dueDate = opts?.dueDate
      ? new Date(opts.dueDate)
      : action.dueDate || null;

    const direction = await this.prisma.direction.create({
      data: {
        title: `[Meeting] ${action.title}`,
        ownerId,
        createdById: actor.id,
        dueDate,
        status: DirectionStatus.ISSUED,
      },
    });

    const updated = await this.prisma.meetingAction.update({
      where: { id: actionId },
      data: { directionId: direction.id, ownerId },
      include: { direction: true },
    });

    await this.notifications.create(
      ownerId,
      'DIRECTION',
      'Direction from meeting action',
      `${action.title} (from meeting: ${action.meeting.title})`,
      direction.id,
    );

    await this.audit.record({
      actorId: actor.id,
      action: 'MEETING_ACTION_TO_DIRECTION',
      entityType: 'Direction',
      entityId: direction.id,
      summary: `Meeting action -> direction: ${action.title}`,
    });

    return { action: updated, direction };
  }

  archive(id: string) {
    return this.prisma.meeting.update({
      where: { id },
      data: { archived: true, status: MeetingStatus.ARCHIVED },
    });
  }
}
