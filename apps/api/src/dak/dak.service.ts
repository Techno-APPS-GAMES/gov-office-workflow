import { BadRequestException, Injectable } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DakService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(user: { id: string; role: Role }, direction?: string, take = 100) {
    const rows = await this.prisma.dakEntry.findMany({
      where: direction ? { direction } : undefined,
      orderBy: { stampedAt: 'desc' },
      take,
      include: {
        stampedBy: { select: { displayName: true, role: true } },
        matter: {
          select: {
            id: true,
            diaryNo: true,
            subject: true,
            classification: true,
            vaultGrants: {
              where: { userId: user.id, expiresAt: { gt: new Date() } },
              take: 1,
            },
          },
        },
      },
    });
    return rows.map((e) => {
      const confidential =
        e.classification === 'CONFIDENTIAL' ||
        e.matter?.classification === Classification.CONFIDENTIAL;
      const unlocked =
        user.role === Role.ADMIN ||
        (e.matter?.vaultGrants?.length || 0) > 0;
      const redact = confidential && !unlocked;
      return {
        ...e,
        subject: redact ? '[Confidential — unlock vault]' : e.subject,
        matter: e.matter
          ? {
              id: e.matter.id,
              diaryNo: e.matter.diaryNo,
              subject: redact ? '[Confidential — unlock vault]' : e.matter.subject,
            }
          : null,
      };
    });
  }

  async stampIn(
    user: { id: string; role: Role; displayName?: string },
    input: {
      fromName: string;
      fromDesignation?: string;
      toName?: string;
      toDesignation?: string;
      channel?: string;
      subject: string;
      classification?: string;
      diaryNo?: string;
      matterId?: string;
      branchName?: string;
    },
  ) {
    const stampedBy = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const linked = await this.resolveMatterLink(input.matterId, input.diaryNo);
    const entry = await this.prisma.dakEntry.create({
      data: {
        direction: 'IN',
        branchName: input.branchName || 'Speaker Office',
        fromName: input.fromName,
        fromDesignation: input.fromDesignation,
        toName: input.toName || stampedBy.displayName,
        toDesignation: input.toDesignation || stampedBy.role,
        channel: input.channel || 'HAND',
        subject: input.subject,
        classification: input.classification,
        diaryNo: linked.diaryNo || input.diaryNo,
        matterId: linked.matterId,
        stampedById: user.id,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'DAK_IN',
      entityType: 'DakEntry',
      entityId: entry.id,
      summary: `Received dak: ${input.subject.slice(0, 120)}`,
    });
    return entry;
  }

  private async resolveMatterLink(matterId?: string, diaryNo?: string) {
    if (!matterId && !diaryNo) return { matterId: undefined as string | undefined, diaryNo: diaryNo };
    if (matterId) {
      const m = await this.prisma.matter.findUnique({ where: { id: matterId } });
      if (!m) throw new BadRequestException('matterId not found');
      if (diaryNo && diaryNo !== m.diaryNo) {
        throw new BadRequestException('diaryNo does not match matterId');
      }
      return { matterId: m.id, diaryNo: m.diaryNo };
    }
    const m = await this.prisma.matter.findFirst({ where: { diaryNo: diaryNo! } });
    if (!m) throw new BadRequestException('diaryNo not found');
    return { matterId: m.id, diaryNo: m.diaryNo };
  }

  async stampOut(
    user: { id: string },
    input: {
      toName: string;
      toDesignation?: string;
      fromName?: string;
      fromDesignation?: string;
      channel?: string;
      subject: string;
      classification?: string;
      diaryNo?: string;
      matterId?: string;
      reference?: string;
      branchName?: string;
    },
  ) {
    const stampedBy = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const linked = await this.resolveMatterLink(input.matterId, input.diaryNo);
    const seq = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(87201403)`);
      const count = await tx.dakEntry.count({ where: { direction: 'OUT' } });
      return count + 1;
    });
    const entry = await this.prisma.dakEntry.create({
      data: {
        direction: 'OUT',
        branchName: input.branchName || 'Speaker Office',
        fromName: input.fromName || stampedBy.displayName,
        fromDesignation: input.fromDesignation || stampedBy.role,
        toName: input.toName,
        toDesignation: input.toDesignation,
        channel: input.channel || 'INTERNAL',
        subject: input.subject,
        classification: input.classification,
        diaryNo: linked.diaryNo || input.diaryNo,
        matterId: linked.matterId,
        reference: input.reference || `OUT-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`,
        stampedById: user.id,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'DAK_OUT',
      entityType: 'DakEntry',
      entityId: entry.id,
      summary: `Despatched dak: ${input.subject.slice(0, 120)}`,
    });
    return entry;
  }
}
