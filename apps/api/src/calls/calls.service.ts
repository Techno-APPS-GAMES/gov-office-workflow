import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CallStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type CallInput = {
  direction: string;
  partyName: string;
  summary: string;
  priority?: string;
  organisation?: string;
  phone?: string;
  addressedTo?: string;
  actionRequired?: string;
  followUpNotes?: string;
  matterId?: string;
  directionId?: string;
  status?: CallStatus;
};

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private canManage(call: { loggedById: string }, user: { id: string; role: Role }) {
    return (
      call.loggedById === user.id ||
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL ||
      user.role === Role.SPECIAL_SECRETARY
    );
  }

  async list(user: { id: string; role: Role }) {
    const canSeeAll =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL ||
      user.role === Role.SPECIAL_SECRETARY;
    const rows = await this.prisma.callRecord.findMany({
      where: canSeeAll ? undefined : { loggedById: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        loggedBy: { select: { id: true, displayName: true, role: true } },
        matter: {
          select: {
            id: true,
            diaryNo: true,
            subject: true,
            status: true,
            holder: { select: { displayName: true } },
          },
        },
        directionRef: { select: { id: true, title: true, status: true } },
      },
    });
    const meetingIds = rows.map((r) => r.meetingId).filter(Boolean) as string[];
    const meetings = meetingIds.length
      ? await this.prisma.meeting.findMany({
          where: { id: { in: meetingIds } },
          select: { id: true, title: true, startAt: true, status: true },
        })
      : [];
    const byId = new Map(meetings.map((m) => [m.id, m]));
    return rows.map((r) => ({
      ...r,
      meeting: r.meetingId ? byId.get(r.meetingId) || null : null,
    }));
  }

  async create(userId: string, data: CallInput) {
    const call = await this.prisma.callRecord.create({
      data: {
        loggedById: userId,
        direction: data.direction,
        partyName: data.partyName,
        summary: data.summary,
        priority: data.priority || 'NORMAL',
        organisation: data.organisation,
        phone: data.phone,
        addressedTo: data.addressedTo,
        actionRequired: data.actionRequired,
        followUpNotes: data.followUpNotes,
        matterId: data.matterId || null,
        directionId: data.directionId || null,
        status: data.status || CallStatus.LOGGED,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'CALL_LOG',
      entityType: 'CallRecord',
      entityId: call.id,
      summary: `Call logged: ${data.partyName}`,
    });
    return call;
  }

  async updateStatus(id: string, status: CallStatus, user: { id: string; role: Role }) {
    const call = await this.prisma.callRecord.findUnique({ where: { id } });
    if (!call) throw new NotFoundException();
    if (!this.canManage(call, user)) throw new ForbiddenException('Cannot update this call');
    const updated = await this.prisma.callRecord.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorId: user.id,
      action: 'CALL_STATUS',
      entityType: 'CallRecord',
      entityId: id,
      summary: `Call status -> ${status}`,
    });
    return updated;
  }

  async linkMatter(id: string, matterId: string | null, user: { id: string; role: Role }) {
    const call = await this.prisma.callRecord.findUnique({ where: { id } });
    if (!call) throw new NotFoundException();
    if (!this.canManage(call, user)) throw new ForbiddenException();
    if (matterId) {
      const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
      if (!matter) throw new NotFoundException('Matter not found');
    }
    const updated = await this.prisma.callRecord.update({
      where: { id },
      data: { matterId },
      include: {
        matter: { select: { id: true, diaryNo: true, subject: true } },
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'CALL_LINK_MATTER',
      entityType: 'CallRecord',
      entityId: id,
      summary: matterId ? `Linked to matter ${matterId}` : 'Unlinked from matter',
    });
    return updated;
  }

  async bookMeeting(
    id: string,
    user: { id: string; role: Role },
    input?: { title?: string; startAt?: string; location?: string },
  ) {
    const call = await this.prisma.callRecord.findUnique({ where: { id } });
    if (!call) throw new NotFoundException();
    if (!this.canManage(call, user)) throw new ForbiddenException();
    const meeting = await this.prisma.meeting.create({
      data: {
        title: input?.title || `Call follow-up: ${call.partyName}`,
        createdById: user.id,
        startAt: input?.startAt ? new Date(input.startAt) : null,
        location: input?.location || 'Speaker Office',
        brief: call.summary,
      },
    });
    const updated = await this.prisma.callRecord.update({
      where: { id },
      data: { meetingId: meeting.id },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'CALL_BOOK_MEETING',
      entityType: 'CallRecord',
      entityId: id,
      summary: `Meeting booked from call: ${meeting.title}`,
    });
    return { call: updated, meeting };
  }

  async issueDirection(
    id: string,
    user: { id: string; role: Role },
    input: { title: string; ownerUserId: string; dueDate?: string },
  ) {
    const call = await this.prisma.callRecord.findUnique({ where: { id } });
    if (!call) throw new NotFoundException();
    if (!this.canManage(call, user)) throw new ForbiddenException();
    if (user.role !== Role.SPEAKER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only Speaker can issue directions from calls');
    }
    const direction = await this.prisma.direction.create({
      data: {
        title: input.title,
        ownerId: input.ownerUserId,
        createdById: user.id,
        matterId: call.matterId,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    const updated = await this.prisma.callRecord.update({
      where: { id },
      data: { directionId: direction.id },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'CALL_DIRECTION',
      entityType: 'CallRecord',
      entityId: id,
      summary: `Direction issued from call: ${direction.title}`,
    });
    return { call: updated, direction };
  }
}
