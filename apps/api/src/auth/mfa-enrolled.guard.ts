import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './roles.decorator';

const MFA_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/mfa/setup',
  '/api/auth/mfa/confirm',
  '/api/auth/me',
  '/api/health',
];

@Injectable()
export class MfaEnrolledGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (process.env.MFA_REQUIRED === 'false') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (MFA_EXEMPT_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
      return true;
    }

    const user = req.user as { mfaEnabled?: boolean } | undefined;
    if (user && user.mfaEnabled === false) {
      throw new ForbiddenException({
        code: 'MFA_SETUP_REQUIRED',
        message: 'Complete MFA enrollment before using the workspace',
      });
    }
    return true;
  }
}
