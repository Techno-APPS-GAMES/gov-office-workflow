import { Injectable } from '@nestjs/common';
import {
  DirectionStatus,
  EsignStatus,
  MeetingStatus,
  Role,
  WorkItemStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  create(userId: string, type: string, title: string, body: string, recordId?: string) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, recordId },
    });
  }

  list(userId: string, opts?: { unreadOnly?: boolean; type?: string }) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts?.unreadOnly ? { read: false } : {}),
        ...(opts?.type ? { type: opts.type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true, updated: result.count };
  }

  /** Speaker appointment inbox desk — meetings, remote review, activity. */
  async desk(user: { id: string; role: Role }) {
    const canDecideMeetings =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL;

    const [
      unreadNotices,
      meetingRequests,
      confirmedMeetings,
      pendingSpeeches,
      evidenceDirections,
      pendingWorkItems,
      pendingEsign,
      recent,
    ] = await Promise.all([
      this.prisma.notification.count({ where: { userId: user.id, read: false } }),
      this.prisma.meeting.findMany({
        where: { archived: false, status: MeetingStatus.REQUESTED },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { createdBy: { select: { displayName: true } } },
      }),
      this.prisma.meeting.count({
        where: { archived: false, status: MeetingStatus.APPROVED },
      }),
      this.prisma.speech.findMany({
        where: { status: { in: ['SUBMITTED', 'PENDING_APPROVAL', 'FOR_REVIEW'] } },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: { author: { select: { displayName: true } } },
      }),
      this.prisma.direction.findMany({
        where: { status: DirectionStatus.EVIDENCE_SUBMITTED },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: {
          owner: { select: { displayName: true } },
          matter: { select: { diaryNo: true } },
        },
      }),
      this.prisma.workItem.findMany({
        where: { status: WorkItemStatus.SUBMITTED },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        include: { owner: { select: { displayName: true } } },
      }),
      this.prisma.esignRecord.findMany({
        where: { status: EsignStatus.PENDING, signerId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: { matter: { select: { diaryNo: true, subject: true } } },
      }),
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const staffRequests = canDecideMeetings ? meetingRequests.length : 0;

    const remoteQueue = [
      ...pendingSpeeches.map((s) => ({
        id: s.id,
        kind: 'SPEECH' as const,
        title: s.title,
        detail: `Speech · ${s.status.replace(/_/g, ' ')} · ${s.author.displayName}`,
        href: '/speeches',
        action: 'Review document',
        primary: true,
      })),
      ...evidenceDirections.map((d) => ({
        id: d.id,
        kind: 'DIRECTION' as const,
        title: d.title,
        detail: `${d.matter?.diaryNo || 'Direction'} · Completion evidence submitted · ${d.owner.displayName}`,
        href: '/directions',
        action: 'Review evidence',
        primary: false,
      })),
      ...pendingWorkItems.map((w) => ({
        id: w.id,
        kind: 'WORK' as const,
        title: w.title,
        detail: `${w.kind} · Submitted · ${w.owner.displayName}`,
        href: '/extensions',
        action: 'Review document',
        primary: true,
      })),
      ...pendingEsign.map((e) => ({
        id: e.id,
        kind: 'ESIGN' as const,
        title: e.matter.subject,
        detail: `${e.matter.diaryNo} · Awaiting your e-sign`,
        href: '/remote',
        action: 'Review & sign',
        primary: true,
      })),
    ];

    return {
      kpis: {
        unreadNotices,
        staffRequests,
        confirmedMeetings,
      },
      pipeline: [
        { key: 'booking', label: 'Direct booking / staff submission', done: true },
        { key: 'diary', label: 'Verified diary confirmation', done: meetingRequests.length === 0 },
        { key: 'calendar', label: 'Calendar synchronisation', done: confirmedMeetings > 0 },
        { key: 'protocol', label: 'Protocol & agenda ready', done: confirmedMeetings > 0 && meetingRequests.length === 0 },
      ],
      meetingRequests: canDecideMeetings
        ? meetingRequests.map((m) => ({
            id: m.id,
            title: m.title,
            startAt: m.startAt?.toISOString() || null,
            location: m.location,
            brief: m.brief,
            requestedBy: m.createdBy.displayName,
            status: m.status,
          }))
        : [],
      remoteQueue,
      remotePending: remoteQueue.length,
      activity: recent.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        recordId: n.recordId,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
        href: hrefForNotice(n.type, n.recordId),
      })),
    };
  }
}

function hrefForNotice(type: string, recordId?: string | null) {
  switch (type) {
    case 'MESSAGE':
      return '/messages';
    case 'MEETING':
      return '/meetings';
    case 'DIRECTION':
      return '/directions';
    case 'ESIGN':
      return '/remote';
    case 'MATTER':
    case 'ROUTE':
      return recordId ? `/files/${recordId}` : '/files';
    default:
      return '/inbox';
  }
}
