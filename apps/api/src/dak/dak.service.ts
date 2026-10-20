import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DakService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  list(direction?: string, take = 100) {
    return this.prisma.dakEntry.findMany({
      where: direction ? { direction } : undefined,
      orderBy: { stampedAt: 'desc' },
      take,
      include: {
        stampedBy: { select: { displayName: true, role: true } },
        matter: { select: { id: true, diaryNo: true, subject: true } },
      },
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
        diaryNo: input.diaryNo,
        matterId: input.matterId,
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
        diaryNo: input.diaryNo,
        matterId: input.matterId,
        reference: input.reference || `OUT-${Date.now()}`,
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
