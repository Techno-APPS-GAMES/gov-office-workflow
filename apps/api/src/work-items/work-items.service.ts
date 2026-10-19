import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Classification, Role, WorkItemStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class WorkItemsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(user: { id: string; role: Role }) {
    const where =
      user.role === Role.SPEAKER || user.role === Role.ADMIN
        ? {}
        : { OR: [{ ownerId: user.id }, { createdById: user.id }] };
    return this.prisma.workItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { displayName: true } },
        createdBy: { select: { displayName: true } },
        matter: { select: { diaryNo: true } },
      },
    });
  }

  async create(
    userId: string,
    data: {
      title: string;
      kind: string;
      text: string;
      language?: string;
      classification?: Classification;
      ownerId?: string;
      matterId?: string;
    },
  ) {
    const item = await this.prisma.workItem.create({
      data: {
        title: data.title,
        kind: data.kind,
        text: data.text,
        language: data.language || 'en',
        classification: data.classification || Classification.INTERNAL,
        ownerId: data.ownerId || userId,
        createdById: userId,
        matterId: data.matterId,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'WORK_CREATE',
      entityType: 'WorkItem',
      entityId: item.id,
      summary: `Work record drafted: ${item.title}`,
    });
    return item;
  }

  async submit(id: string, userId: string) {
    const item = await this.prisma.workItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    if (item.ownerId !== userId && item.createdById !== userId) {
      throw new ForbiddenException();
    }
    return this.prisma.workItem.update({
      where: { id },
      data: { status: WorkItemStatus.SUBMITTED },
    });
  }

  async decide(id: string, actorId: string, approve: boolean) {
    const status = approve ? WorkItemStatus.APPROVED : WorkItemStatus.REJECTED;
    const item = await this.prisma.workItem.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorId,
      action: approve ? 'WORK_APPROVE' : 'WORK_REJECT',
      entityType: 'WorkItem',
      entityId: id,
      summary: `${approve ? 'Approved' : 'Rejected'} work record ${item.title}`,
    });
    return item;
  }
}
