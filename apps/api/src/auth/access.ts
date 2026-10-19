import { ForbiddenException } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';

export function canSeeAllMatters(role: Role) {
  return role === Role.SPEAKER || role === Role.ADMIN;
}

export function assertMatterReadable(
  matter: {
    classification: Classification;
    createdById: string;
    holderId: string | null;
    assigneeId: string | null;
  },
  user: { id: string; role: Role },
) {
  if (canSeeAllMatters(user.role)) return;
  if (matter.classification === Classification.CONFIDENTIAL) {
    // vault grant checked separately
    return;
  }
  const involved =
    matter.createdById === user.id ||
    matter.holderId === user.id ||
    matter.assigneeId === user.id;
  if (involved) return;
  if (
    matter.classification === Classification.PUBLIC ||
    matter.classification === Classification.INTERNAL
  ) {
    // Internal/public visible to office roles except pure DG_IT (oversight only)
    if (user.role === Role.DG_IT) {
      throw new ForbiddenException('DG IT cannot open operational matters');
    }
    return;
  }
  throw new ForbiddenException('No access to this matter');
}

export function sanitizeFilename(name: string) {
  return name.replace(/[\r\n"/\\]/g, '_').slice(0, 180) || 'download.bin';
}
