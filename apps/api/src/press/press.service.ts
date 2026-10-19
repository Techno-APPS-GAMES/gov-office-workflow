import { Injectable, NotFoundException } from '@nestjs/common';
import { PressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PressService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list() {
    return this.prisma.pressRelease.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { author: { select: { displayName: true, role: true } } },
    });
  }

  private nextCode() {
    const year = new Date().getFullYear();
    const n = Math.floor(1 + Math.random() * 900);
    return `PR-${year}-${String(n).padStart(3, '0')}`;
  }

  private draftPid(code: string) {
    const year = new Date().getFullYear();
    const tail = code.split('-').pop() || '000';
    return `NA/PR/${year}/${tail}-DRAFT`;
  }

  private livePid() {
    const year = new Date().getFullYear().toString().slice(-2);
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PID(I)${n}/${year}`;
  }

  async create(
    authorId: string,
    data: {
      title: string;
      body: string;
      titleUr?: string;
      bodyUr?: string;
      wire?: string;
    },
  ) {
    const code = this.nextCode();
    const p = await this.prisma.pressRelease.create({
      data: {
        authorId,
        title: data.title,
        body: data.body,
        titleUr: data.titleUr || null,
        bodyUr: data.bodyUr || null,
        wire:
          data.wire ||
          'PID, PTV News, Radio Pakistan, APP, National Parliamentary Reporters',
        code,
        pidRef: this.draftPid(code),
        status: PressStatus.DRAFT,
      },
      include: { author: { select: { displayName: true, role: true } } },
    });
    await this.audit.record({
      actorId: authorId,
      action: 'PRESS_CREATE',
      entityType: 'PressRelease',
      entityId: p.id,
      summary: `Press draft: ${p.title}`,
    });
    return p;
  }

  async setStatus(id: string, actorId: string, status: PressStatus) {
    const existing = await this.prisma.pressRelease.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Press release not found');

    const data: {
      status: PressStatus;
      approvedAt?: Date;
      dispatchedAt?: Date;
      pidRef?: string;
    } = { status };

    if (status === PressStatus.APPROVED) {
      data.approvedAt = new Date();
      if (existing.pidRef?.includes('-DRAFT')) {
        data.pidRef = existing.pidRef.replace('-DRAFT', '');
      }
    }
    if (status === PressStatus.DISPATCHED) {
      data.dispatchedAt = new Date();
      data.approvedAt = existing.approvedAt || new Date();
      data.pidRef = existing.pidRef?.includes('PID(I)')
        ? existing.pidRef
        : this.livePid();
    }

    const p = await this.prisma.pressRelease.update({
      where: { id },
      data,
      include: { author: { select: { displayName: true, role: true } } },
    });
    await this.audit.record({
      actorId,
      action: 'PRESS_STATUS',
      entityType: 'PressRelease',
      entityId: id,
      summary: `Press ${p.code || p.title} → ${status}`,
    });
    return p;
  }
}
