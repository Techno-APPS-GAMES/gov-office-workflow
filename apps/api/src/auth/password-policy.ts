import { BadRequestException } from '@nestjs/common';

/**
 * Password policy. In demo mode (DEMO_WEAK_PASSWORDS=true) only min length 6 is enforced.
 * Production / default: min 12 + upper/lower/digit/special — matches SECURITY.md.
 */
export function assertPasswordPolicy(password: string) {
  const weakOk = process.env.DEMO_WEAK_PASSWORDS === 'true';
  if (weakOk) {
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    return;
  }
  if (password.length < 12) {
    throw new BadRequestException('Password must be at least 12 characters');
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestException('Password must include a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestException('Password must include an uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException('Password must include a digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new BadRequestException('Password must include a special character');
  }
}
