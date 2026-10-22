import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

/** Parse TTL like 15m / 7d / 12h into milliseconds. */
function parseTtlMs(raw: string | undefined, fallbackMs: number) {
  if (!raw) return fallbackMs;
  const m = String(raw).trim().match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult =
    unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  totpCode?: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

class MfaConfirmDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    const secure = process.env.COOKIE_SECURE === 'true';
    // Keep cookies aligned with ACCESS_TOKEN_TTL / REFRESH_TOKEN_TTL (demo: long-lived).
    const accessMs = parseTtlMs(process.env.ACCESS_TOKEN_TTL, 7 * 86400_000);
    const refreshMs = parseTtlMs(process.env.REFRESH_TOKEN_TTL, 30 * 86400_000);
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: accessMs,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: refreshMs,
      path: '/api/auth',
    });
  }

  @Public()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.username, dto.password, dto.totpCode, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      mfaSetupRequired: result.mfaSetupRequired,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken || req.cookies?.refresh_token;
    const result = await this.auth.refresh(token);
    this.setCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: { id: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.id, req.cookies?.refresh_token);
    res.clearCookie('access_token');
    res.clearCookie('refresh_token', { path: '/api/auth' });
    return { ok: true };
  }

  @Post('mfa/setup')
  beginMfa(@CurrentUser() user: { id: string }) {
    return this.auth.beginMfa(user.id);
  }

  @Post('mfa/confirm')
  confirmMfa(@CurrentUser() user: { id: string }, @Body() dto: MfaConfirmDto) {
    return this.auth.confirmMfa(user.id, dto.code);
  }

  @Post('me')
  me(@CurrentUser() user: unknown) {
    return { user };
  }
}
