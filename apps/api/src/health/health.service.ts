import { Injectable } from '@nestjs/common';
import {
  Classification,
  DirectionStatus,
  MeetingStatus,
  MatterStatus,
  Role,
  WorkItemStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async check() {
    let db = false;
    let redis = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    try {
      const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      });
      await r.connect();
      const pong = await r.ping();
      redis = pong === 'PONG';
      r.disconnect();
    } catch {
      redis = false;
    }
    return {
      ok: db,
      db,
      redis,
      ts: new Date().toISOString(),
    };
  }

  async overview() {
    const [users, matters, open, confidential, auditCount, sessions] = await Promise.all([
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.matter.count(),
      this.prisma.matter.count({ where: { status: { not: MatterStatus.CLOSED } } }),
      this.prisma.matter.count({ where: { classification: Classification.CONFIDENTIAL } }),
      this.prisma.auditEvent.count(),
      this.prisma.refreshToken.count({
        where: { revoked: false, expiresAt: { gt: new Date() } },
      }),
    ]);
    return {
      users,
      matters,
      open,
      confidential,
      auditCount,
      sessions,
      features: {
        ai: Boolean(process.env.AI_ENDPOINT),
        ldap: process.env.LDAP_ENABLED === 'true',
        esign: process.env.ESIGN_PROVIDER || 'local_pki',
      },
    };
  }

  /** Speaker-desk dashboard payload aligned to reference office overview IA. */
  async dashboard(user: { id: string; role: Role }) {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 86400_000);

    const [
      totalMatters,
      openMatters,
      closedMatters,
      awaitingDecision,
      overdueDirections,
      openDirections,
      evidenceSubmitted,
      escalatedDirections,
      publicCount,
      internalCount,
      confidentialCount,
      directionGroups,
      subjectGroups,
      openFiles,
      directions,
      upcomingMeetings,
      upcomingSchedule,
      unreadInbox,
      meetingsConfirmed,
      meetingsPending,
      workRecords,
      workAwaiting,
      directionRemindersDue,
    ] = await Promise.all([
      this.prisma.matter.count(),
      this.prisma.matter.count({ where: { status: { not: MatterStatus.CLOSED } } }),
      this.prisma.matter.count({ where: { status: MatterStatus.CLOSED } }),
      this.prisma.matter.count({ where: { status: MatterStatus.AWAITING_DECISION } }),
      this.prisma.direction.count({ where: { status: DirectionStatus.OVERDUE } }),
      this.prisma.direction.count({
        where: { status: { notIn: [DirectionStatus.CLOSED] } },
      }),
      this.prisma.direction.count({ where: { status: DirectionStatus.EVIDENCE_SUBMITTED } }),
      this.prisma.direction.count({ where: { status: DirectionStatus.ESCALATED } }),
      this.prisma.matter.count({ where: { classification: Classification.PUBLIC } }),
      this.prisma.matter.count({ where: { classification: Classification.INTERNAL } }),
      this.prisma.matter.count({ where: { classification: Classification.CONFIDENTIAL } }),
      this.prisma.direction.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.matter.groupBy({
        by: ['subjectArea'],
        _count: { _all: true },
        orderBy: { _count: { subjectArea: 'desc' } },
      }),
      this.prisma.matter.findMany({
        where: { status: { not: MatterStatus.CLOSED } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          holder: { select: { displayName: true, role: true } },
          createdBy: { select: { displayName: true } },
          vaultGrants: {
            where: { userId: user.id, expiresAt: { gt: now } },
            take: 1,
          },
        },
      }),
      this.prisma.direction.findMany({
        where:
          user.role === Role.SPEAKER || user.role === Role.ADMIN
            ? { status: { not: DirectionStatus.CLOSED } }
            : { ownerId: user.id, status: { not: DirectionStatus.CLOSED } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 8,
        include: {
          owner: { select: { displayName: true } },
          matter: { select: { diaryNo: true, subject: true } },
        },
      }),
      this.prisma.meeting.count({
        where: {
          archived: false,
          startAt: { gte: now, lte: weekAhead },
        },
      }),
      this.prisma.scheduleItem.count({
        where: { startAt: { gte: now, lte: weekAhead } },
      }),
      this.prisma.notification.count({
        where: { userId: user.id, read: false },
      }),
      this.prisma.meeting.count({
        where: { archived: false, status: MeetingStatus.APPROVED },
      }),
      this.prisma.meeting.count({
        where: { archived: false, status: MeetingStatus.REQUESTED },
      }),
      this.prisma.workItem.count(),
      this.prisma.workItem.count({ where: { status: WorkItemStatus.SUBMITTED } }),
      this.prisma.direction.count({
        where: {
          status: { notIn: [DirectionStatus.CLOSED] },
          dueDate: { lte: weekAhead },
        },
      }),
    ]);

    const classTotal = publicCount + internalCount + confidentialCount || 1;
    const byClassification = [
      { key: 'PUBLIC', label: 'Public', count: publicCount, pct: Math.round((publicCount / classTotal) * 1000) / 10 },
      { key: 'INTERNAL', label: 'Internal', count: internalCount, pct: Math.round((internalCount / classTotal) * 1000) / 10 },
      { key: 'CONFIDENTIAL', label: 'Confidential', count: confidentialCount, pct: Math.round((confidentialCount / classTotal) * 1000) / 10 },
    ];

    const dirMap = Object.fromEntries(directionGroups.map((g) => [g.status, g._count._all]));
    const complianceSlices = [
      { key: 'CLOSED', label: 'Verified & closed', count: dirMap[DirectionStatus.CLOSED] || 0 },
      { key: 'IN_PROGRESS', label: 'In progress', count: dirMap[DirectionStatus.IN_PROGRESS] || 0 },
      { key: 'ISSUED', label: 'Issued (new)', count: dirMap[DirectionStatus.ISSUED] || 0 },
      { key: 'EVIDENCE_SUBMITTED', label: 'Evidence submitted', count: dirMap[DirectionStatus.EVIDENCE_SUBMITTED] || 0 },
      {
        key: 'OVERDUE_ESCALATED',
        label: 'Overdue / escalated',
        count: (dirMap[DirectionStatus.OVERDUE] || 0) + (dirMap[DirectionStatus.ESCALATED] || 0),
      },
    ];
    const complianceTotal = complianceSlices.reduce((s, x) => s + x.count, 0) || 1;
    const byDirectionStatus = complianceSlices.map((s) => ({
      ...s,
      pct: Math.round((s.count / complianceTotal) * 1000) / 10,
    }));

    const subjectTotal = subjectGroups.reduce((s, g) => s + g._count._all, 0) || 1;
    const bySubjectArea = subjectGroups.map((g) => ({
      label: g.subjectArea,
      count: g._count._all,
      pct: Math.round((g._count._all / subjectTotal) * 1000) / 10,
    }));

    const attention = overdueDirections + awaitingDecision + escalatedDirections;

    return {
      kpis: {
        mattersTotal: totalMatters,
        mattersOpen: openMatters,
        mattersClosed: closedMatters,
        directionsOpen: openDirections,
        evidenceSubmitted,
        overdueAttention: attention,
        highPriority: overdueDirections + escalatedDirections,
        meetingsConfirmed,
        meetingsPending,
        workRecords,
        workAwaiting,
      },
      byClassification,
      byDirectionStatus,
      bySubjectArea,
      upcoming: {
        meetings: upcomingMeetings,
        schedule: upcomingSchedule,
        overdueDirections,
        directionRemindersDue,
        meetingsPending,
        workAwaiting,
        unreadInbox,
      },
      openFiles: openFiles.map((m) => {
        const unlocked = (m.vaultGrants?.length || 0) > 0 || user.role === Role.ADMIN;
        return {
          id: m.id,
          diaryNo: m.diaryNo,
          subject: m.subject,
          sender: m.sender,
          status: m.status,
          classification: m.classification,
          priority: m.priority,
          holder: m.holder?.displayName || null,
          createdBy: m.createdBy.displayName,
          updatedAt: m.updatedAt.toISOString(),
          vaultUnlocked: unlocked,
        };
      }),
      directions: directions.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        dueDate: d.dueDate?.toISOString() || null,
        owner: d.owner.displayName,
        matter: d.matter
          ? { diaryNo: d.matter.diaryNo, subject: d.matter.subject }
          : null,
      })),
    };
  }
}
