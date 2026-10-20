import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cheap workspace stamp — clients poll this and only reload lists/details when it changes.
 * Driven by audit ledger sequence (bumped on most mutations).
 */
@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  async stamp() {
    const [audit, matter] = await Promise.all([
      this.prisma.auditEvent.findFirst({
        orderBy: { seq: 'desc' },
        select: { seq: true, createdAt: true },
      }),
      this.prisma.matter.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    const seq = audit?.seq ?? 0;
    const matterMs = matter?.updatedAt?.getTime() ?? 0;
    return {
      stamp: `${seq}:${matterMs}`,
      seq,
      at: audit?.createdAt?.toISOString() || new Date().toISOString(),
    };
  }
}
