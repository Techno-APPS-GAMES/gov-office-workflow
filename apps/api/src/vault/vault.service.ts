import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { canSeeAllMatters } from '../auth/access';

/** In-memory unlock failure counters (per process — enough for pilot lockout). */
const unlockFails = new Map<string, { count: number; until?: number }>();

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

  private failKey(matterId: string, userId: string) {
    return `${matterId}:${userId}`;
  }

  private assertNotLockedOut(matterId: string, userId: string) {
    const row = unlockFails.get(this.failKey(matterId, userId));
    if (row?.until && row.until > Date.now()) {
      const secs = Math.ceil((row.until - Date.now()) / 1000);
      throw new BadRequestException(`Too many failed unlocks — try again in ${secs}s`);
    }
  }

  private recordUnlockFail(matterId: string, userId: string) {
    const key = this.failKey(matterId, userId);
    const prev = unlockFails.get(key) || { count: 0 };
    const count = prev.count + 1;
    const until = count >= 5 ? Date.now() + 15 * 60_000 : undefined;
    unlockFails.set(key, { count: until ? 0 : count, until });
  }

  private clearUnlockFails(matterId: string, userId: string) {
    unlockFails.delete(this.failKey(matterId, userId));
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

  async listEvents(user: { id: string; role: Role }, limit = 50) {
    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SPEAKER &&
      user.role !== Role.DG_IT
    ) {
      throw new ForbiddenException('Vault ledger is restricted');
    }
    return this.prisma.auditEvent.findMany({
      where: {
        action: { in: ['VAULT_UNLOCK', 'VAULT_LOCK', 'VAULT_ROTATE', 'VAULT_UNLOCK_FAILED'] },
      },
      orderBy: { seq: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, displayName: true, role: true } },
      },
    });
  }

  async verifyLedger(user: { id: string; role: Role }) {
    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SPEAKER &&
      user.role !== Role.DG_IT
    ) {
      throw new ForbiddenException('Vault verify is restricted');
    }
    const chain = await this.audit.verifyChain();
    const unlocked = await this.prisma.vaultGrant.count({
      where: { expiresAt: { gt: new Date() } },
    });
    return {
      ...chain,
      unlockedSessions: unlocked,
      ttlMinutes: this.unlockTtlMinutes(),
      // Honest crypto description — content uses envelope AES-256-GCM under office master key;
      // file password is a bcrypt gate for unlock grants (not PBKDF2 content KDF).
      cipher: 'AES-256-GCM (envelope encryption)',
      unlockGate: 'bcrypt file password',
      kdf: 'n/a (master-key envelope; not password-derived content key)',
      iterations: null,
      saltBytes: null,
    };
  }

  async unlock(matterId: string, userId: string, password: string) {
    this.assertNotLockedOut(matterId, userId);
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
    if (!ok) {
      this.recordUnlockFail(matterId, userId);
      await this.audit.record({
        actorId: userId,
        action: 'VAULT_UNLOCK_FAILED',
        entityType: 'Matter',
        entityId: matterId,
        summary: `Failed vault unlock on ${matter.diaryNo}`,
      });
      throw new BadRequestException('Invalid file password');
    }
    this.clearUnlockFails(matterId, userId);
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

  async rotatePassword(
    matterId: string,
    user: { id: string; role: Role },
    current: string,
    next: string,
  ) {
    if (next.length < 12) throw new BadRequestException('New password too short');
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    const canRotate =
      user.role === Role.ADMIN ||
      matter.createdById === user.id ||
      matter.holderId === user.id;
    if (!canRotate) {
      throw new ForbiddenException('Only holder, creator, or ADMIN may rotate vault password');
    }
    if (!matter.filePasswordHash) throw new BadRequestException('No password set');
    const ok = await this.crypto.verifyPassword(current, matter.filePasswordHash);
    if (!ok) throw new BadRequestException('Current password invalid');
    await this.prisma.matter.update({
      where: { id: matterId },
      data: { filePasswordHash: await this.crypto.hashPassword(next) },
    });
    await this.prisma.vaultGrant.deleteMany({ where: { matterId } });
    await this.audit.record({
      actorId: user.id,
      action: 'VAULT_ROTATE',
      entityType: 'Matter',
      entityId: matterId,
      summary: 'Vault password rotated; grants cleared',
    });
    return { ok: true };
  }
}
