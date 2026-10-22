import { ForbiddenException } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';

export function canSeeAllMatters(role: Role) {
  return role === Role.SPEAKER || role === Role.ADMIN;
}

/** Confidential work records: owner plus Speaker/Admin only (no broad office read). */
function workItemClassificationGate(user: { id: string; role: Role }) {
  if (user.role === Role.SPEAKER || user.role === Role.ADMIN) {
    return {};
  }
  return {
    OR: [
      { classification: { in: [Classification.PUBLIC, Classification.INTERNAL] } },
      { classification: Classification.CONFIDENTIAL, ownerId: user.id },
    ],
  };
}

/** Work-item list/search visibility (mirrors work-items.list). */
export function workItemVisibilityWhere(user: { id: string; role: Role }) {
  const classGate = workItemClassificationGate(user);
  if (user.role === Role.SPEAKER || user.role === Role.ADMIN) {
    return {};
  }
  if (user.role === Role.SECRETARY_GENERAL) {
    return classGate;
  }
  return {
    AND: [{ OR: [{ ownerId: user.id }, { createdById: user.id }] }, classGate],
  };
}

/** Matter rows visible in list/dashboard (mirrors files.list). */
export function matterVisibilityWhere(user: { id: string; role: Role }) {
  const grantOk = {
    OR: [
      { classification: { in: [Classification.PUBLIC, Classification.INTERNAL] } },
      {
        classification: Classification.CONFIDENTIAL,
        OR: [
          { vaultGrants: { some: { userId: user.id, expiresAt: { gt: new Date() } } } },
          { createdById: user.id },
          { holderId: user.id },
        ],
      },
    ],
  };
  if (canSeeAllMatters(user.role)) {
    return user.role === Role.ADMIN ? {} : grantOk;
  }
  if (user.role === Role.DG_IT) {
    return { id: { in: [] as string[] } };
  }
  return {
    AND: [
      {
        OR: [
          { createdById: user.id },
          { holderId: user.id },
          { assigneeId: user.id },
          { classification: { in: [Classification.PUBLIC, Classification.INTERNAL] } },
        ],
      },
      grantOk,
    ],
  };
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
