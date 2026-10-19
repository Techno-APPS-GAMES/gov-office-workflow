import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { assertPasswordPolicy } from '../auth/password-policy';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        role: true,
        active: true,
        mfaEnabled: true,
        createdAt: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async create(input: {
    username: string;
    displayName: string;
    email: string;
    password: string;
    role: Role;
    actorId: string;
  }) {
    assertPasswordPolicy(input.password);
    const passwordHash = await this.crypto.hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        email: input.email,
        passwordHash,
        role: input.role,
      },
    });
    await this.audit.record({
      actorId: input.actorId,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: user.id,
      summary: `Created user ${user.username} (${user.role})`,
    });
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    };
  }
}
