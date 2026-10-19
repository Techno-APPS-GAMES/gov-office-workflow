import { Injectable, NotFoundException } from '@nestjs/common';
import { PressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class GreetingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list() {
    return this.prisma.greetingCard.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { author: { select: { displayName: true, role: true } } },
    });
  }

  private nextCardCode() {
    const year = new Date().getFullYear();
    const n = Math.floor(1 + Math.random() * 900);
    return `GC-${year}-${String(n).padStart(3, '0')}`;
  }

  private nextDispatchRef() {
    const year = new Date().getFullYear();
    const n = Math.floor(1 + Math.random() * 900);
    return `NA/SPK/GREET/${year}/${String(n).padStart(3, '0')}`;
  }

  async create(
    authorId: string,
    data: {
      occasion: string;
      recipient: string;
      message: string;
      titleUr?: string;
      messageUr?: string;
      style?: string;
      recipientCount?: number;
      occasionKey?: string;
      occasionDate?: string;
    },
  ) {
    const g = await this.prisma.greetingCard.create({
      data: {
        authorId,
        occasion: data.occasion,
        recipient: data.recipient,
        message: data.message,
        titleUr: data.titleUr || null,
        messageUr: data.messageUr || null,
        style: data.style || 'STATE_GOLD',
        recipientCount: data.recipientCount ?? 0,
        occasionKey: data.occasionKey || null,
        occasionDate: data.occasionDate ? new Date(data.occasionDate) : null,
        cardCode: this.nextCardCode(),
        status: PressStatus.DRAFT,
      },
      include: { author: { select: { displayName: true, role: true } } },
    });
    await this.audit.record({
      actorId: authorId,
      action: 'GREETING_CREATE',
      entityType: 'GreetingCard',
      entityId: g.id,
      summary: `Greeting drafted: ${g.occasion}`,
    });
    return g;
  }

  async setStatus(id: string, actorId: string, status: PressStatus) {
    const existing = await this.prisma.greetingCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Greeting card not found');

    const data: {
      status: PressStatus;
      approvedAt?: Date;
      dispatchedAt?: Date;
      dispatchRef?: string;
    } = { status };

    if (status === PressStatus.APPROVED) {
      data.approvedAt = new Date();
    }
    if (status === PressStatus.DISPATCHED) {
      data.dispatchedAt = new Date();
      data.dispatchRef = existing.dispatchRef || this.nextDispatchRef();
      if (!existing.approvedAt) data.approvedAt = existing.approvedAt || new Date();
    }

    const g = await this.prisma.greetingCard.update({
      where: { id },
      data,
      include: { author: { select: { displayName: true, role: true } } },
    });
    await this.audit.record({
      actorId,
      action: 'GREETING_STATUS',
      entityType: 'GreetingCard',
      entityId: id,
      summary: `Greeting ${g.cardCode || g.occasion} → ${status}`,
    });
    return g;
  }
}
