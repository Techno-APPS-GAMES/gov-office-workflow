import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

/** Normalize punctuation only — keep Urdu/Unicode intact (DB must be UTF-8). */
function normalizeSummary(text: string) {
  return (text || '')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .slice(0, 2000);
}

@Injectable()
export class AuditService {
  private chainVerifyCache: {
    at: number;
    result: Awaited<ReturnType<AuditService['verifyChain']>>;
  } | null = null;

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  private async cachedVerifyChain() {
    const now = Date.now();
    if (this.chainVerifyCache && now - this.chainVerifyCache.at < 60_000) {
      return this.chainVerifyCache.result;
    }
    const result = await this.verifyChain();
    this.chainVerifyCache = { at: now, result };
    return result;
  }

  async record(input: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    ip?: string;
    userAgent?: string;
  }) {
    const summary = normalizeSummary(input.summary);
    // Serialize chain appends to avoid prevHash forks under concurrent writes.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(87201401)`);
      const last = await tx.auditEvent.findFirst({
        orderBy: { seq: 'desc' },
      });
      const prevHash = last?.hash || 'GENESIS';
      const material = [
        prevHash,
        input.actorId || '',
        input.action,
        input.entityType,
        input.entityId || '',
        summary,
      ].join('|');
      const hash = this.crypto.sha256(material);
      return tx.auditEvent.create({
        data: {
          actorId: input.actorId || null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId || null,
          summary,
          ip: input.ip,
          userAgent: input.userAgent,
          prevHash,
          hash,
        },
      });
    });
  }

  async verifyChain() {
    const events = await this.prisma.auditEvent.findMany({ orderBy: { seq: 'asc' } });
    let prev = 'GENESIS';
    for (const e of events) {
      if (e.prevHash !== prev) {
        return { valid: false, count: events.length, failedAt: e.seq };
      }
      const material = [
        e.prevHash,
        e.actorId || '',
        e.action,
        e.entityType,
        e.entityId || '',
        e.summary,
      ].join('|');
      const expected = this.crypto.sha256(material);
      if (e.hash !== expected) {
        return { valid: false, count: events.length, failedAt: e.seq };
      }
      prev = e.hash;
    }
    return { valid: true, count: events.length };
  }

  async list(limit = 100) {
    return this.prisma.auditEvent.findMany({
      orderBy: { seq: 'desc' },
      take: limit,
      include: { actor: { select: { id: true, username: true, displayName: true, role: true } } },
    });
  }

  async dashboard() {
    const now = new Date();
    const dayMs = 86400000;
    const ago30 = new Date(now.getTime() - 30 * dayMs);
    const ago7 = new Date(now.getTime() - 6 * dayMs);
    ago7.setHours(0, 0, 0, 0);

    const closedMatter = ['CLOSED'] as const;
    const openDir = ['ISSUED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'RETURNED', 'OVERDUE', 'ESCALATED'];

    const [
      verify,
      lastEvent,
      activeMatters,
      actions30,
      esignSigned,
      esignPending,
      esignRevoked,
      urgentDirs,
      overdueDirs,
      rejectedWork,
      events7,
      signed7,
      eventsAll,
      users,
      directions,
      matters,
    ] = await Promise.all([
      this.cachedVerifyChain(),
      this.prisma.auditEvent.findFirst({ orderBy: { seq: 'desc' } }),
      this.prisma.matter.count({ where: { status: { notIn: [...closedMatter] } } }),
      this.prisma.auditEvent.count({ where: { createdAt: { gte: ago30 } } }),
      this.prisma.esignRecord.count({ where: { status: 'SIGNED' } }),
      this.prisma.esignRecord.count({ where: { status: 'PENDING' } }),
      this.prisma.esignRecord.count({ where: { status: 'REVOKED' } }),
      this.prisma.direction.count({
        where: { status: { in: ['OVERDUE', 'ESCALATED', 'EVIDENCE_SUBMITTED'] } },
      }),
      this.prisma.direction.count({ where: { status: 'OVERDUE' } }),
      this.prisma.workItem.count({ where: { status: 'REJECTED' } }),
      this.prisma.auditEvent.findMany({
        where: { createdAt: { gte: ago7 } },
        select: { createdAt: true, action: true },
      }),
      this.prisma.esignRecord.findMany({
        where: { status: 'SIGNED', signedAt: { gte: ago7 } },
        select: { signedAt: true },
      }),
      this.prisma.auditEvent.findMany({
        orderBy: { seq: 'desc' },
        take: 200,
        include: {
          actor: { select: { id: true, displayName: true, role: true, username: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { active: true },
        select: { id: true, displayName: true, role: true, username: true },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.direction.findMany({
        where: { status: { in: openDir as any } },
        include: { owner: { select: { id: true, displayName: true, role: true } } },
      }),
      this.prisma.matter.findMany({
        where: { status: { notIn: [...closedMatter] } },
        select: { subjectArea: true, updatedAt: true, createdAt: true, status: true },
      }),
    ]);

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const dailyMap = new Map<string, { events: number; seals: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(ago7.getTime() + i * dayMs);
      dailyMap.set(dayKey(d), { events: 0, seals: 0 });
    }
    for (const e of events7) {
      const k = dayKey(new Date(e.createdAt));
      const slot = dailyMap.get(k);
      if (slot) slot.events += 1;
    }
    for (const s of signed7) {
      if (!s.signedAt) continue;
      const k = dayKey(new Date(s.signedAt));
      const slot = dailyMap.get(k);
      if (slot) slot.seals += 1;
    }
    const daily = [...dailyMap.entries()].map(([date, v]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      }),
      events: v.events,
      seals: v.seals,
    }));
    const eventsPast5 = daily.slice(-5).reduce((n, d) => n + d.events + d.seals, 0);

    const byActor = new Map<
      string,
      {
        id: string;
        displayName: string;
        role: string;
        username: string;
        actions: number;
        completions: number;
        lastAt: string | null;
        events: typeof eventsAll;
      }
    >();
    for (const u of users) {
      byActor.set(u.id, {
        id: u.id,
        displayName: u.displayName,
        role: u.role,
        username: u.username,
        actions: 0,
        completions: 0,
        lastAt: null,
        events: [],
      });
    }
    for (const e of eventsAll) {
      if (!e.actorId || !e.actor) continue;
      let row = byActor.get(e.actorId);
      if (!row) {
        row = {
          id: e.actor.id,
          displayName: e.actor.displayName,
          role: e.actor.role,
          username: e.actor.username,
          actions: 0,
          completions: 0,
          lastAt: null,
          events: [],
        };
        byActor.set(e.actorId, row);
      }
      row.actions += 1;
      if (/SIGN|APPROVE|CLOSE|COMPLETE|DISPATCH|VERIFY/i.test(e.action)) row.completions += 1;
      if (!row.lastAt || e.createdAt > new Date(row.lastAt)) row.lastAt = e.createdAt.toISOString();
      if (row.events.length < 40) row.events.push(e);
    }

    const people = [...byActor.values()]
      .map((p) => {
        const owned = directions.filter((d) => d.ownerId === p.id || d.owner?.id === p.id);
        const pending = owned.filter((d) => d.status !== 'CLOSED' && d.status !== 'OVERDUE').length;
        const pastDue = owned.filter((d) => d.status === 'OVERDUE' || d.status === 'ESCALATED').length;
        return {
          id: p.id,
          displayName: p.displayName,
          role: p.role,
          username: p.username,
          actions: p.actions,
          completions: p.completions,
          lastAt: p.lastAt,
          assignments: owned.length,
          pending,
          pastDue,
          totalRecords: p.actions,
          recent: p.events.slice(0, 12).map((e) => ({
            id: e.id,
            action: e.action,
            summary: e.summary,
            createdAt: e.createdAt.toISOString(),
            hash: e.hash,
          })),
        };
      })
      .sort((a, b) => b.actions - a.actions);

    const workload = people.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      role: p.role,
      actions: p.actions,
      pending: p.pending,
      pastDue: p.pastDue,
    }));

    const areaMap = new Map<string, { count: number; delayDays: number }>();
    for (const m of matters) {
      const key = m.subjectArea || 'Other';
      const age = Math.max(
        0,
        Math.round((now.getTime() - new Date(m.createdAt).getTime()) / dayMs),
      );
      const cur = areaMap.get(key) || { count: 0, delayDays: 0 };
      cur.count += 1;
      cur.delayDays += age;
      areaMap.set(key, cur);
    }
    const bySubject = [...areaMap.entries()]
      .map(([label, v]) => ({
        label,
        count: v.count,
        avgDelayDays: v.count ? Math.round(v.delayDays / v.count) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      kpis: {
        activeWorkflows: activeMatters,
        totalActions: actions30,
        esignEvents: esignSigned,
        urgentQueue: esignPending + urgentDirs,
        rejectedFlagged: esignRevoked + rejectedWork + overdueDirs,
      },
      daily,
      dailySummary: {
        eventsPast5,
        sealDays: daily.filter((d) => d.seals > 0).length,
      },
      chain: {
        ...verify,
        lastCheckpoint: lastEvent?.hash || null,
        lastAt: lastEvent?.createdAt?.toISOString() || null,
        prevHash: lastEvent?.prevHash || 'GENESIS',
      },
      people,
      workload,
      bySubject,
      events: eventsAll.slice(0, 128).map((e) => ({
        id: e.id,
        seq: e.seq,
        action: e.action,
        summary: e.summary,
        hash: e.hash,
        createdAt: e.createdAt.toISOString(),
        actor: e.actor,
      })),
    };
  }

  async buildExcelReport(): Promise<Buffer> {
    const [dash, events, verify] = await Promise.all([
      this.dashboard(),
      this.list(1000),
      this.verifyChain(),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'GOW Audit';
    wb.created = new Date();

    const summary = wb.addWorksheet('Summary');
    summary.columns = [
      { header: 'Metric', key: 'metric', width: 32 },
      { header: 'Value', key: 'value', width: 48 },
    ];
    summary.addRows([
      { metric: 'Generated at', value: new Date().toISOString() },
      { metric: 'Chain valid', value: verify.valid ? 'Yes' : `No (seq ${verify.failedAt})` },
      { metric: 'Chain event count', value: verify.count },
      { metric: 'Last checkpoint', value: dash.chain.lastCheckpoint || '' },
      { metric: 'Active workflows', value: dash.kpis.activeWorkflows },
      { metric: 'Total actions (30d)', value: dash.kpis.totalActions },
      { metric: 'E-sign / SHA-256 seals', value: dash.kpis.esignEvents },
      { metric: 'Urgent queue', value: dash.kpis.urgentQueue },
      { metric: 'Rejected / flagged', value: dash.kpis.rejectedFlagged },
    ]);
    summary.getRow(1).font = { bold: true };

    const daily = wb.addWorksheet('Daily activity');
    daily.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Events', key: 'events', width: 12 },
      { header: 'Seals', key: 'seals', width: 12 },
    ];
    daily.getRow(1).font = { bold: true };
    for (const d of dash.daily) {
      daily.addRow({ date: d.date, events: d.events, seals: d.seals });
    }

    const people = wb.addWorksheet('Activity by person');
    people.columns = [
      { header: 'Officer', key: 'name', width: 28 },
      { header: 'Role', key: 'role', width: 22 },
      { header: 'Actions', key: 'actions', width: 12 },
      { header: 'Completions', key: 'completions', width: 14 },
      { header: 'Assignments', key: 'assignments', width: 14 },
      { header: 'Pending', key: 'pending', width: 12 },
      { header: 'Past due', key: 'pastDue', width: 12 },
      { header: 'Last activity', key: 'lastAt', width: 24 },
    ];
    people.getRow(1).font = { bold: true };
    for (const p of dash.people) {
      people.addRow({
        name: p.displayName,
        role: p.role,
        actions: p.actions,
        completions: p.completions,
        assignments: p.assignments,
        pending: p.pending,
        pastDue: p.pastDue,
        lastAt: p.lastAt || '',
      });
    }

    const subjects = wb.addWorksheet('Subject areas');
    subjects.columns = [
      { header: 'Subject area', key: 'label', width: 28 },
      { header: 'Open matters', key: 'count', width: 14 },
      { header: 'Avg age (days)', key: 'avgDelayDays', width: 16 },
    ];
    subjects.getRow(1).font = { bold: true };
    for (const s of dash.bySubject) {
      subjects.addRow(s);
    }

    const ledger = wb.addWorksheet('Audit events');
    ledger.columns = [
      { header: 'Seq', key: 'seq', width: 8 },
      { header: 'Timestamp', key: 'createdAt', width: 24 },
      { header: 'Action', key: 'action', width: 22 },
      { header: 'Actor', key: 'actor', width: 24 },
      { header: 'Role', key: 'role', width: 18 },
      { header: 'Entity', key: 'entity', width: 18 },
      { header: 'Summary', key: 'summary', width: 48 },
      { header: 'Hash', key: 'hash', width: 68 },
      { header: 'Prev hash', key: 'prevHash', width: 68 },
    ];
    ledger.getRow(1).font = { bold: true };
    for (const e of events) {
      ledger.addRow({
        seq: e.seq,
        createdAt: e.createdAt?.toISOString?.() || e.createdAt,
        action: e.action,
        actor: e.actor?.displayName || '',
        role: e.actor?.role || '',
        entity: e.entityType,
        summary: e.summary,
        hash: e.hash,
        prevHash: e.prevHash,
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
