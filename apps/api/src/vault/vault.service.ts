import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { canSeeAllMatters } from '../auth/access';

@Injectable()
export class VaultService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  unlockTtlMinutes() {
    return Number(process.env.VAULT_UNLOCK_TTL_MINUTES || 30);
  }

  listConfidential(user: { id: string; role: Role }) {
    const where = canSeeAllMatters(user.role)
      ? { classification: Classification.CONFIDENTIAL }
      : {
          classification: Classification.CONFIDENTIAL,
          OR: [
            { createdById: user.id },
            { holderId: user.id },
            { assigneeId: user.id },
            { vaultGrants: { some: { userId: user.id, expiresAt: { gt: new Date() } } } },
          ],
        };
    return this.prisma.matter.findMany({
      where,
      select: {
        id: true,
        diaryNo: true,
        subject: true,
        status: true,
        createdAt: true,
        holder: { select: { id: true, displayName: true, role: true } },
        vaultGrants: {
          where: { userId: user.id, expiresAt: { gt: new Date() } },
          select: { expiresAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listEvents(limit = 50) {
    return this.prisma.auditEvent.findMany({
      where: {
        action: { in: ['VAULT_UNLOCK', 'VAULT_LOCK', 'VAULT_ROTATE'] },
      },
      orderBy: { seq: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, displayName: true, role: true } },
      },
    });
  }

  async verifyLedger() {
    const chain = await this.audit.verifyChain();
    const unlocked = await this.prisma.vaultGrant.count({
      where: { expiresAt: { gt: new Date() } },
    });
    return {
      ...chain,
      unlockedSessions: unlocked,
      ttlMinutes: this.unlockTtlMinutes(),
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2',
      iterations: 100_000,
      saltBytes: 32,
    };
  }

  async unlock(matterId: string, userId: string, password: string) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter || matter.classification !== Classification.CONFIDENTIAL) {
      throw new NotFoundException('Confidential matter not found');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const allowed =
      canSeeAllMatters(user.role) ||
      matter.createdById === userId ||
      matter.holderId === userId ||
      matter.assigneeId === userId;
    if (!allowed) throw new BadRequestException('Not authorized to unlock this matter');
    if (!matter.filePasswordHash) throw new BadRequestException('No vault password set');
    const ok = await this.crypto.verifyPassword(password, matter.filePasswordHash);
    if (!ok) throw new BadRequestException('Invalid file password');
    const minutes = this.unlockTtlMinutes();
    await this.prisma.vaultGrant.deleteMany({ where: { matterId, userId } });
    const grant = await this.prisma.vaultGrant.create({
      data: {
        matterId,
        userId,
        expiresAt: new Date(Date.now() + minutes * 60_000),
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'VAULT_UNLOCK',
      entityType: 'Matter',
      entityId: matterId,
      summary: `Vault unlock granted for ${minutes}m on ${matter.diaryNo}`,
    });
    return grant;
  }

  async lock(matterId: string, userId: string) {
    await this.prisma.vaultGrant.deleteMany({ where: { matterId, userId } });
    await this.audit.record({
      actorId: userId,
      action: 'VAULT_LOCK',
      entityType: 'Matter',
      entityId: matterId,
      summary: 'Vault access revoked',
    });
    return { ok: true };
  }

  async rotatePassword(matterId: string, userId: string, current: string, next: string) {
    if (next.length < 12) throw new BadRequestException('New password too short');
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    if (!matter.filePasswordHash) throw new BadRequestException('No password set');
    const ok = await this.crypto.verifyPassword(current, matter.filePasswordHash);
    if (!ok) throw new BadRequestException('Current password invalid');
    await this.prisma.matter.update({
      where: { id: matterId },
      data: { filePasswordHash: await this.crypto.hashPassword(next) },
    });
    await this.prisma.vaultGrant.deleteMany({ where: { matterId } });
    await this.audit.record({
      actorId: userId,
      action: 'VAULT_ROTATE',
      entityType: 'Matter',
      entityId: matterId,
      summary: 'Vault password rotated; grants cleared',
    });
    return { ok: true };
  }
}
