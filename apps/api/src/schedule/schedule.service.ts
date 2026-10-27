import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeetingStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

export type BusySlot = {
  id: string;
  source: 'schedule' | 'meeting';
  title: string;
  startAt: Date;
  endAt: Date;
};

export type AltSlot = {
  startAt: string;
  endAt: string;
  label: string;
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/** Diary office hours are evaluated in OFFICE_TZ (default Asia/Karachi). Override via env OFFICE_TZ. */
const OFFICE_TZ = process.env.OFFICE_TZ || 'Asia/Karachi';

function officeYmdHm(d: Date, tz = OFFICE_TZ) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    f.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
  };
}

/** Map office-local wall time to UTC using Intl (no extra deps). */
function utcFromOfficeLocal(
  y: number,
  m: number,
  day: number,
  h: number,
  min: number,
  tz = OFFICE_TZ,
) {
  let utc = Date.UTC(y, m - 1, day, h, min, 0);
  for (let i = 0; i < 4; i++) {
    const loc = officeYmdHm(new Date(utc), tz);
    const desired = Date.UTC(y, m - 1, day, h, min, 0);
    const got = Date.UTC(loc.y, loc.m - 1, loc.d, loc.h, loc.min, 0);
    utc += desired - got;
  }
  return new Date(utc);
}

function addOfficeCalendarDays(anchor: Date, days: number, tz = OFFICE_TZ) {
  const { y, m, d } = officeYmdHm(anchor, tz);
  const noon = utcFromOfficeLocal(y, m, d, 12, 0, tz);
  return officeYmdHm(new Date(noon.getTime() + days * 86_400_000), tz);
}

@Injectable()
export class ScheduleService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  list(user: { id: string; role: Role }, ownerId?: string) {
    const canBrowse =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL;
    if (ownerId && ownerId !== user.id && !canBrowse) {
      throw new ForbiddenException('Cannot view another officer schedule');
    }
    const where = ownerId
      ? { ownerId }
      : canBrowse
        ? undefined
        : { ownerId: user.id };
    return this.prisma.scheduleItem.findMany({
      where,
      orderBy: { startAt: 'asc' },
      include: { owner: { select: { displayName: true } } },
    });
  }

  /** Busy intervals for an owner: diary items + approved meetings (office-wide diary). */
  async busySlots(ownerId: string, from: Date, to: Date): Promise<BusySlot[]> {
    const [items, meetings] = await Promise.all([
      this.prisma.scheduleItem.findMany({
        where: {
          ownerId,
          startAt: { lt: to },
          endAt: { gt: from },
        },
      }),
      this.prisma.meeting.findMany({
        where: {
          archived: false,
          status: MeetingStatus.APPROVED,
          startAt: { not: null, lt: to },
          OR: [{ endAt: null }, { endAt: { gt: from } }],
        },
      }),
    ]);

    const slots: BusySlot[] = items.map((i) => ({
      id: i.id,
      source: 'schedule' as const,
      title: i.title,
      startAt: i.startAt,
      endAt: i.endAt,
    }));

    for (const m of meetings) {
      if (!m.startAt) continue;
      const end = m.endAt || new Date(m.startAt.getTime() + 60 * 60 * 1000);
      if (!overlaps(from, to, m.startAt, end)) continue;
      slots.push({
        id: m.id,
        source: 'meeting',
        title: m.title,
        startAt: m.startAt,
        endAt: end,
      });
    }
    return slots.sort((a, b) => +a.startAt - +b.startAt);
  }

  async findConflicts(
    ownerId: string,
    startAt: Date,
    endAt: Date,
    excludeScheduleId?: string,
  ) {
    if (!(startAt < endAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    const windowStart = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    const busy = await this.busySlots(ownerId, windowStart, windowEnd);
    return busy.filter(
      (s) =>
        !(s.source === 'schedule' && excludeScheduleId && s.id === excludeScheduleId) &&
        overlaps(startAt, endAt, s.startAt, s.endAt),
    );
  }

  /**
   * Suggest free slots of the same duration within ±2 days (office hours 09:00–17:00 in OFFICE_TZ).
   * Acceptance test: conflict within overlapping window; alternatives are non-overlapping.
   */
  async suggestAlternatives(
    ownerId: string,
    startAt: Date,
    endAt: Date,
    limit = 5,
  ): Promise<AltSlot[]> {
    const durationMs = Math.max(15 * 60_000, endAt.getTime() - startAt.getTime());
    const searchFrom = new Date(startAt.getTime() - 2 * 24 * 60 * 60 * 1000);
    const searchTo = new Date(startAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const busy = await this.busySlots(ownerId, searchFrom, searchTo);

    const candidates: Date[] = [];
    // Immediate offsets from requested start
    for (const mins of [30, 60, 90, 120, 180]) {
      candidates.push(new Date(startAt.getTime() + mins * 60_000));
    }
    // Next mornings at 10:00 and afternoons at 14:00 for 3 office-calendar days
    for (let d = 0; d < 3; d++) {
      const parts = addOfficeCalendarDays(startAt, d);
      for (const hour of [10, 11, 14, 15]) {
        const c = utcFromOfficeLocal(parts.y, parts.m, parts.d, hour, 0);
        if (c.getTime() !== startAt.getTime()) candidates.push(c);
      }
    }

    const alts: AltSlot[] = [];
    const seen = new Set<string>();
    for (const candStart of candidates) {
      const startOffice = officeYmdHm(candStart);
      if (startOffice.h < 9 || startOffice.h >= 17) continue;
      const candEnd = new Date(candStart.getTime() + durationMs);
      const endOffice = officeYmdHm(candEnd);
      if (endOffice.h > 18 || (endOffice.h === 18 && endOffice.min > 0)) continue;
      const key = candStart.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = busy.some((s) => overlaps(candStart, candEnd, s.startAt, s.endAt));
      if (hit) continue;
      alts.push({
        startAt: candStart.toISOString(),
        endAt: candEnd.toISOString(),
        label: `${candStart.toLocaleString(undefined, {
          timeZone: OFFICE_TZ,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })} (${Math.round(durationMs / 60000)} min)`,
      });
      if (alts.length >= limit) break;
    }
    return alts;
  }

  async check(
    user: { id: string; role: Role },
    data: { startAt: string; endAt: string; ownerId?: string; excludeId?: string },
  ) {
    const ownerId = data.ownerId || user.id;
    const canBrowse =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL ||
      user.role === Role.SPECIAL_SECRETARY;
    if (ownerId !== user.id && !canBrowse) {
      throw new ForbiddenException('Cannot check another officer schedule');
    }
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    const conflicts = await this.findConflicts(ownerId, startAt, endAt, data.excludeId);
    const alternatives =
      conflicts.length > 0 ? await this.suggestAlternatives(ownerId, startAt, endAt) : [];
    return {
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
  }

  async create(
    actor: { id: string; role: Role },
    ownerId: string,
    data: {
      title: string;
      startAt: string;
      endAt: string;
      location?: string;
      force?: boolean;
    },
  ) {
    const canCreateForOthers =
      actor.role === Role.SPEAKER ||
      actor.role === Role.ADMIN ||
      actor.role === Role.SECRETARY_GENERAL ||
      actor.role === Role.SPECIAL_SECRETARY;
    if (ownerId !== actor.id && !canCreateForOthers) {
      throw new ForbiddenException('Cannot create schedule for another user');
    }
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    if (!(startAt < endAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }

    // Serialize conflict check + insert per owner to avoid double-book races.
    const item = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(87201402)`);
      const conflicts = await this.findConflicts(ownerId, startAt, endAt);
      if (conflicts.length && !data.force) {
        const alternatives = await this.suggestAlternatives(ownerId, startAt, endAt);
        throw new ConflictException({
          message: 'Schedule conflict detected',
          conflicts: conflicts.map((c) => ({
            id: c.id,
            source: c.source,
            title: c.title,
            startAt: c.startAt.toISOString(),
            endAt: c.endAt.toISOString(),
          })),
          alternatives,
        });
      }
      const created = await tx.scheduleItem.create({
        data: {
          ownerId,
          title: data.title,
          startAt,
          endAt,
          location: data.location,
        },
      });
      return { created, conflicts };
    });
    const conflicts = item.conflicts;
    const created = item.created;
    await this.audit.record({
      actorId: actor.id,
      action: 'SCHEDULE_CREATE',
      entityType: 'ScheduleItem',
      entityId: created.id,
      summary: `Diary: ${created.title}${conflicts.length ? ' (forced over conflict)' : ''}`,
    });

    const when = `${startAt.toLocaleString()} – ${endAt.toLocaleString()}`;
    const forcedNote = conflicts.length ? ' (booked over a conflict)' : '';
    if (ownerId !== actor.id) {
      await this.notifications.create(
        ownerId,
        'SCHEDULE_CHANGE',
        'Diary updated',
        `${actor.role}: added "${created.title}" at ${when}${forcedNote}`,
        created.id,
      );
    }
    if (conflicts.length) {
      const speakers = await this.prisma.user.findMany({
        where: { role: { in: [Role.SPEAKER, Role.SECRETARY_GENERAL] }, active: true },
        select: { id: true },
      });
      for (const s of speakers) {
        if (s.id === actor.id || s.id === ownerId) continue;
        await this.notifications.create(
          s.id,
          'SCHEDULE_CHANGE',
          'Schedule conflict override',
          `"${created.title}" forced onto diary at ${when}`,
          created.id,
        );
      }
    }

    return {
      item: created,
      conflictForced: conflicts.length > 0,
      conflicts: conflicts.map((c) => ({
        id: c.id,
        source: c.source,
        title: c.title,
        startAt: c.startAt.toISOString(),
        endAt: c.endAt.toISOString(),
      })),
    };
  }

  async remove(id: string, user: { id: string; role: Role }) {
    const item = await this.prisma.scheduleItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    const canDeleteAny = user.role === Role.SPEAKER || user.role === Role.ADMIN;
    if (item.ownerId !== user.id && !canDeleteAny) {
      throw new ForbiddenException('Cannot delete this schedule item');
    }
    await this.prisma.scheduleItem.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'SCHEDULE_DELETE',
      entityType: 'ScheduleItem',
      entityId: id,
      summary: `Removed diary item: ${item.title}`,
    });
    if (item.ownerId !== user.id) {
      await this.notifications.create(
        item.ownerId,
        'SCHEDULE_CHANGE',
        'Diary item removed',
        `${user.role} removed "${item.title}" from your diary`,
        id,
      );
    }
    return { ok: true };
  }
}
