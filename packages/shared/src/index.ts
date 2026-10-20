import { z } from 'zod';

export const Role = {
  SPEAKER: 'SPEAKER',
  SECRETARY_GENERAL: 'SECRETARY_GENERAL',
  SPECIAL_SECRETARY: 'SPECIAL_SECRETARY',
  DG_IT: 'DG_IT',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Classification = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
} as const;
export type Classification = (typeof Classification)[keyof typeof Classification];

export const MatterStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_RECEIPT: 'AWAITING_RECEIPT',
  AWAITING_DECISION: 'AWAITING_DECISION',
  CLOSED: 'CLOSED',
} as const;

export const DirectionStatus = {
  ISSUED: 'ISSUED',
  IN_PROGRESS: 'IN_PROGRESS',
  EVIDENCE_SUBMITTED: 'EVIDENCE_SUBMITTED',
  RETURNED: 'RETURNED',
  CLOSED: 'CLOSED',
  OVERDUE: 'OVERDUE',
  ESCALATED: 'ESCALATED',
} as const;

export const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(12).max(128),
  totpCode: z.string().length(6).optional(),
});

export const registerMatterSchema = z.object({
  subject: z.string().min(3).max(500),
  sender: z.string().min(1).max(300),
  body: z.string().min(1).max(100_000),
  classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']),
  subjectArea: z.string().min(1).max(120),
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
  filePassword: z.string().min(12).max(128).optional(),
});

export const routeMatterSchema = z.object({
  toUserId: z.string().uuid(),
  procedure: z.string().min(2).max(300),
  dueDate: z.string().datetime().optional(),
  remarks: z.string().max(5_000).optional(),
});

export const decisionSchema = z.object({
  text: z.string().min(1).max(20_000),
  decisionType: z.enum(['APPROVE', 'REJECT', 'DIRECTION', 'NO_FURTHER_ACTION']),
  directionTitle: z.string().max(500).optional(),
  ownerUserId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

/** Nav order aligned to reference product IA (original implementation). */
export const ROLE_NAV: Record<Role, string[]> = {
  SPEAKER: [
    'overview', 'inbox', 'ai', 'messages', 'files', 'registry', 'vault', 'movement', 'directions',
    'calls', 'remote', 'meetings', 'schedule', 'speeches', 'press', 'greetings',
    'search', 'extensions', 'people', 'audit',
  ],
  SECRETARY_GENERAL: [
    'overview', 'inbox', 'ai', 'messages', 'files', 'registry', 'vault', 'movement', 'directions',
    'calls', 'remote', 'meetings', 'schedule', 'speeches', 'press', 'greetings', 'search',
    'extensions', 'people',
  ],
  SPECIAL_SECRETARY: [
    'overview', 'inbox', 'ai', 'messages', 'files', 'registry', 'vault', 'movement', 'directions',
    'calls', 'remote', 'meetings', 'schedule', 'speeches', 'press', 'greetings', 'search',
    'extensions', 'people',
  ],
  DG_IT: ['overview', 'audit'],
  ADMIN: [
    'overview', 'inbox', 'ai', 'messages', 'files', 'registry', 'vault', 'movement', 'directions',
    'calls', 'remote', 'meetings', 'schedule', 'speeches', 'press', 'greetings',
    'search', 'extensions', 'people', 'audit',
  ],
};

export const NAV_GROUPS: [string, string[]][] = [
  ['My desk', ['overview', 'inbox', 'ai', 'messages']],
  ['Files & decisions', ['files', 'registry', 'vault', 'movement', 'directions', 'calls', 'remote']],
  ['Calendar & media', ['meetings', 'schedule', 'speeches', 'press', 'greetings']],
  ['Research & records', ['search', 'extensions', 'people']],
  ['Governance', ['audit']],
];

export const ROLE_META: Record<
  Role,
  { title: string; blurb: string; usernameHint: string }
> = {
  SPEAKER: {
    title: 'Speaker',
    blurb: 'Final decisions, oversight and confidential-file access',
    usernameHint: 'speaker',
  },
  SECRETARY_GENERAL: {
    title: 'Secretary General',
    blurb: 'Ordinary files assigned to this desk, requests and dispatch',
    usernameHint: 'secgen',
  },
  SPECIAL_SECRETARY: {
    title: 'Special Secretary',
    blurb: 'Assigned reviews, directions and evidence',
    usernameHint: 'specsec',
  },
  DG_IT: {
    title: 'DG IT',
    blurb: 'Audit integrity and action metadata',
    usernameHint: 'dgit',
  },
  ADMIN: {
    title: 'Administrator',
    blurb: 'Full system administration',
    usernameHint: 'admin',
  },
};
