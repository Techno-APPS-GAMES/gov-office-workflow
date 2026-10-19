import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Portable exit pack — consultation §4 / §7: documents, metadata, audit in usable form.
 */
@Injectable()
export class ExportService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async pack(user: { id: string; role: Role }) {
    if (user.role !== Role.SPEAKER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Export pack requires Speaker or Admin');
    }

    const [
      matters,
      directions,
      meetings,
      schedule,
      speeches,
      press,
      greetings,
      calls,
      workItems,
      auditEvents,
      users,
    ] = await Promise.all([
      this.prisma.matter.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          diaryNo: true,
          subject: true,
          sender: true,
          status: true,
          classification: true,
          subjectArea: true,
          priority: true,
          decisionType: true,
          decisionText: true,
          createdAt: true,
          updatedAt: true,
          closedAt: true,
          attachments: {
            select: {
              id: true,
              fileName: true,
              contentType: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
          versions: { select: { kind: true, reason: true, hash: true, createdAt: true } },
        },
      }),
      this.prisma.direction.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          matterId: true,
          ownerId: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: { archived: false },
        orderBy: { createdAt: 'asc' },
        include: {
          actions: {
            select: {
              id: true,
              title: true,
              ownerName: true,
              ownerId: true,
              dueDate: true,
              directionId: true,
            },
          },
        },
      }),
      this.prisma.scheduleItem.findMany({ orderBy: { startAt: 'asc' } }),
      this.prisma.speech.findMany({
        select: {
          id: true,
          title: true,
          language: true,
          status: true,
          eventDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.pressRelease.findMany({
        select: {
          id: true,
          title: true,
          titleUr: true,
          status: true,
          code: true,
          createdAt: true,
        },
      }),
      this.prisma.greetingCard.findMany({
        select: {
          id: true,
          occasion: true,
          recipient: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.callRecord.findMany({
        orderBy: { createdAt: 'asc' },
        take: 5000,
        select: {
          id: true,
          direction: true,
          priority: true,
          status: true,
          partyName: true,
          organisation: true,
          summary: true,
          matterId: true,
          directionId: true,
          meetingId: true,
          createdAt: true,
        },
      }),
      this.prisma.workItem.findMany({
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.auditEvent.findMany({
        orderBy: { seq: 'asc' },
        take: 50_000,
        select: {
          seq: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          prevHash: true,
          hash: true,
          createdAt: true,
          actorId: true,
        },
      }),
      this.prisma.user.findMany({
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
      }),
    ]);

    const pack = {
      format: 'gow-exit-pack',
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: user.id,
      note: 'Synthetic / operational metadata export. Attachment binaries remain in object storage; use storage dump for full binary exit.',
      counts: {
        matters: matters.length,
        directions: directions.length,
        meetings: meetings.length,
        scheduleItems: schedule.length,
        speeches: speeches.length,
        press: press.length,
        greetings: greetings.length,
        calls: calls.length,
        workItems: workItems.length,
        auditEvents: auditEvents.length,
        users: users.length,
      },
      users,
      matters,
      directions,
      meetings,
      schedule,
      speeches,
      press,
      greetings,
      calls,
      workItems,
      auditEvents,
    };

    await this.audit.record({
      actorId: user.id,
      action: 'EXPORT_PACK',
      entityType: 'System',
      entityId: null,
      summary: `Exit pack generated (${pack.counts.matters} matters, ${pack.counts.auditEvents} audit events)`,
    });

    return pack;
  }
}
