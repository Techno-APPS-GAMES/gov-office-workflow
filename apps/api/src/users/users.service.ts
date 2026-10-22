import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertPasswordPolicy } from '../auth/password-policy';

const select = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  role: true,
  active: true,
  mfaEnabled: true,
  ldapDn: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  list(opts?: { q?: string; role?: string; active?: string }) {
    const where: Record<string, unknown> = {};
    if (opts?.role) {
      const r = opts.role.toUpperCase();
      if (Object.values(Role).includes(r as Role)) where.role = r as Role;
    }
    if (opts?.active === 'true') where.active = true;
    if (opts?.active === 'false') where.active = false;
    const q = (opts?.q || '').trim();
    if (q) {
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      select,
      orderBy: [{ active: 'desc' }, { displayName: 'asc' }],
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(input: {
    username: string;
    displayName: string;
    email: string;
    password: string;
    role: Role;
    actorId: string;
  }) {
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    if (username.length < 3) throw new BadRequestException('Username min 3 characters');
    if (displayName.length < 2) throw new BadRequestException('Display name required');
    if (!/^[a-z0-9._-]+$/i.test(username)) {
      throw new BadRequestException('Username may use letters, digits, . _ - only');
    }
    assertPasswordPolicy(input.password);

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (clash) {
      throw new ConflictException(
        clash.username === username ? 'Username already exists' : 'Email already exists',
      );
    }

    const passwordHash = await this.crypto.hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        username,
        displayName,
        email,
        passwordHash,
        role: input.role,
        active: true,
      },
      select,
    });

    await this.audit.record({
      actorId: input.actorId,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: user.id,
      summary: `Created user ${user.username} (${user.role})`,
    });

    await this.notifications.create(
      user.id,
      'USER',
      'Account created',
      `Your office account (${user.username}) is ready. Change the temporary password on first login if required.`,
      user.id,
    );

    return user;
  }

  async update(
    id: string,
    actorId: string,
    data: {
      displayName?: string;
      email?: string;
      role?: Role;
      active?: boolean;
      password?: string;
    },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    if (data.email) {
      const email = data.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (clash) throw new ConflictException('Email already exists');
    }

    if (data.password) assertPasswordPolicy(data.password);

    if (data.active === false && id === actorId) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        displayName: data.displayName !== undefined ? data.displayName.trim() : undefined,
        email: data.email !== undefined ? data.email.trim().toLowerCase() : undefined,
        role: data.role,
        active: data.active,
        passwordHash: data.password
          ? await this.crypto.hashPassword(data.password)
          : undefined,
      },
      select,
    });

    await this.audit.record({
      actorId,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: id,
      summary: `Updated user ${user.username}${data.active === false ? ' (deactivated)' : data.active === true ? ' (activated)' : ''}`,
    });
    return user;
  }
}
