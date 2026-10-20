import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { assertPasswordPolicy } from './password-policy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  private accessSecret() {
    const s = process.env.JWT_ACCESS_SECRET;
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_ACCESS_SECRET must be set (min 32 chars) in production');
      }
      return 'dev-access-secret-change-me-32chars!!';
    }
    return s;
  }
  private refreshSecret() {
    const s = process.env.JWT_REFRESH_SECRET;
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_REFRESH_SECRET must be set (min 32 chars) in production');
      }
      return 'dev-refresh-secret-change-me-32chars!';
    }
    return s;
  }

  async login(
    username: string,
    password: string,
    totpCode: string | undefined,
    meta: { ip?: string; userAgent?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');
    const ok = await this.crypto.verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const mfaRequired = process.env.MFA_REQUIRED !== 'false';
    // Demo-only: MFA_SKIP_LOGIN_TOTP=true. Ignored in pilot/production (S1-05).
    const pilotHardened =
      process.env.PILOT_MODE === 'true' || process.env.NODE_ENV === 'production';
    const skipLoginTotp =
      process.env.MFA_SKIP_LOGIN_TOTP === 'true' && !pilotHardened;
    if (mfaRequired && user.mfaEnabled && !skipLoginTotp) {
      if (!totpCode || !user.mfaSecretEnc) throw new UnauthorizedException('MFA code required');
      const secret = this.crypto.decryptSecret(user.mfaSecretEnc);
      const valid = authenticator.check(totpCode, secret);
      if (!valid) throw new UnauthorizedException('Invalid MFA code');
    }

    const tokens = await this.issueTokens(user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      summary: `User ${user.username} signed in`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        email: user.email,
        mfaEnabled: user.mfaEnabled,
      },
      ...tokens,
      mfaSetupRequired: mfaRequired && !user.mfaEnabled,
    };
  }

  /** Used when creating users — enforce complexity. */
  validateNewPassword(password: string) {
    assertPasswordPolicy(password);
  }

  async issueTokens(userId: string) {
    const accessTtl = process.env.ACCESS_TOKEN_TTL || '7d';
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: this.accessSecret(), expiresIn: accessTtl as `${number}d` },
    );
    const refreshRaw = randomBytes(48).toString('hex');
    const tokenHash = this.crypto.sha256(refreshRaw);
    const refreshMs = parseEnvTtlMs(process.env.REFRESH_TOKEN_TTL, 30 * 86400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + refreshMs),
      },
    });
    return { accessToken, refreshToken: refreshRaw };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.crypto.sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });
    return this.issueTokens(stored.userId);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.crypto.sha256(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash },
        data: { revoked: true },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    }
    await this.audit.record({
      actorId: userId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: userId,
      summary: 'User signed out',
    });
    return { ok: true };
  }

  async beginMfa(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    const enc = this.crypto.encryptSecret(secret);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: enc, mfaEnabled: false },
    });
    const otpauth = authenticator.keyuri(user.username, 'GOW Office', secret);
    const qr = await QRCode.toDataURL(otpauth);
    return { otpauth, qr, secret };
  }

  async confirmMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEnc) throw new BadRequestException('Start MFA enrollment first');
    const secret = this.crypto.decryptSecret(user.mfaSecretEnc);
    if (!authenticator.check(code, secret)) throw new BadRequestException('Invalid code');
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
    await this.audit.record({
      actorId: userId,
      action: 'MFA_ENABLED',
      entityType: 'User',
      entityId: userId,
      summary: 'TOTP MFA enabled',
    });
    return { ok: true };
  }
}

function parseEnvTtlMs(raw: string | undefined, fallbackMs: number) {
  if (!raw) return fallbackMs;
  const m = String(raw).trim().match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult =
    unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}
