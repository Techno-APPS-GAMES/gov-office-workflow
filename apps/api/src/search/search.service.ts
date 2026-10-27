import { Injectable } from '@nestjs/common';
import { Classification, DirectionStatus, MeetingStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeAllMatters, workItemVisibilityWhere } from '../auth/access';

export type SearchIntent = {
  kind: 'general' | 'directions' | 'meetings' | 'overdue' | 'people';
  keywords: string;
  statusHint?: string;
};

/** Light NL intent parsing — keyword expansion, not an external model. */
export function parseSearchIntent(raw: string): SearchIntent {
  const q = raw.trim();
  const lower = q.toLowerCase();

  const overdue =
    /\boverdue\b/.test(lower) ||
    /\bpast due\b/.test(lower) ||
    /تاخیر|زائدالمیعاد/.test(q);
  const directions =
    /\bdirection/.test(lower) ||
    /\bfollow[- ]?up\b/.test(lower) ||
    /ہدایت/.test(q);
  const meetings =
    /\bmeeting/.test(lower) ||
    /\bvisitor/.test(lower) ||
    /\bdelegation\b/.test(lower) ||
    /ملاقات|وفد/.test(q);
  const people =
    /\bwho is\b/.test(lower) ||
    /\bstaff\b/.test(lower) ||
    /\bofficer\b/.test(lower);

  let keywords = q
    .replace(/\b(find|show|list|search|get|please|me|the|a|an|all|any|about|for|of|with)\b/gi, ' ')
    .replace(/\b(overdue|past due|directions?|follow[- ]?ups?|meetings?|visitors?|delegations?|staff|officers?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let kind: SearchIntent['kind'] = 'general';
  if (overdue || (directions && overdue)) kind = 'overdue';
  else if (directions) kind = 'directions';
  else if (meetings) kind = 'meetings';
  else if (people) kind = 'people';

  return { kind, keywords: keywords || q, statusHint: overdue ? 'OVERDUE' : undefined };
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(q: string, user: { id: string; role: Role }) {
    const term = q.trim();
    if (!term) {
      return {
        intent: null,
        matters: [],
        people: [],
        workItems: [],
        directions: [],
        meetings: [],
      };
    }
    if (term.length < 3) {
      return {
        intent: parseSearchIntent(term),
        matters: [],
        people: [],
        workItems: [],
        directions: [],
        meetings: [],
        note: 'Enter at least 3 characters to search. Full-text search (FTS) is planned for a future release.',
      };
    }
    if (term.length < 3) {
      return {
        intent: null,
        note: 'Enter at least 3 characters',
        matters: [],
        people: [],
        workItems: [],
        directions: [],
        meetings: [],
      };
    }

    const intent = parseSearchIntent(term);
    const kw = intent.keywords;

    const classificationGate = {
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

    const matterScope = canSeeAllMatters(user.role)
      ? classificationGate
      : user.role === Role.DG_IT
        ? { id: { in: [] as string[] } }
        : {
            AND: [
              {
                OR: [
                  { createdById: user.id },
                  { holderId: user.id },
                  { assigneeId: user.id },
                  { classification: { in: [Classification.PUBLIC, Classification.INTERNAL] } },
                ],
              },
              classificationGate,
            ],
          };

    const workScope = workItemVisibilityWhere(user);

    const directionScope =
      user.role === Role.SPEAKER || user.role === Role.ADMIN
        ? {}
        : { ownerId: user.id };

    const meetingScope =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL ||
      user.role === Role.SPECIAL_SECRETARY
        ? { archived: false }
        : { archived: false, createdById: user.id };

    const textOr = (fields: string[]) => ({
      OR: fields.map((f) => ({ [f]: { contains: kw, mode: 'insensitive' as const } })),
    });

    const matterSelect = {
      id: true,
      diaryNo: true,
      subject: true,
      status: true,
      classification: true,
    } as const;

    const [mattersMeta, mattersBody, mattersOcr, people, workItems, directions, meetings] =
      await Promise.all([
      intent.kind === 'people' || intent.kind === 'directions' || intent.kind === 'overdue'
        ? Promise.resolve([])
        : this.prisma.matter.findMany({
            where: {
              AND: [
                matterScope,
                {
                  OR: [
                    { diaryNo: { contains: kw, mode: 'insensitive' } },
                    { subject: { contains: kw, mode: 'insensitive' } },
                    { sender: { contains: kw, mode: 'insensitive' } },
                  ],
                },
              ],
            },
            take: 40,
            select: matterSelect,
          }),
      intent.kind === 'people' || intent.kind === 'directions' || intent.kind === 'overdue'
        ? Promise.resolve([])
        : this.prisma.matter.findMany({
            where: {
              AND: [matterScope, { body: { contains: kw, mode: 'insensitive' } }],
            },
            take: 12,
            select: matterSelect,
          }),
      intent.kind === 'people' || intent.kind === 'directions' || intent.kind === 'overdue'
        ? Promise.resolve([])
        : this.prisma.matter.findMany({
            where: {
              AND: [
                matterScope,
                {
                  attachments: {
                    some: { extractedText: { contains: kw, mode: 'insensitive' } },
                  },
                },
              ],
            },
            take: 12,
            select: matterSelect,
          }),
      intent.kind === 'directions' || intent.kind === 'overdue' || intent.kind === 'meetings'
        ? Promise.resolve([])
        : this.prisma.user.findMany({
            where: {
              active: true,
              OR: [
                { displayName: { contains: kw, mode: 'insensitive' } },
                { username: { contains: kw, mode: 'insensitive' } },
                { email: { contains: kw, mode: 'insensitive' } },
              ],
            },
            take: 20,
            select: { id: true, displayName: true, username: true, email: true, role: true },
          }),
      intent.kind === 'people' || intent.kind === 'meetings'
        ? Promise.resolve([])
        : this.prisma.workItem.findMany({
            where: {
              AND: [workScope, textOr(['title', 'text'])],
            },
            take: 20,
            select: { id: true, title: true, status: true, kind: true },
          }),
      intent.kind === 'meetings' || intent.kind === 'people'
        ? Promise.resolve([])
        : this.prisma.direction.findMany({
            where: {
              AND: [
                directionScope,
                intent.kind === 'overdue'
                  ? { status: DirectionStatus.OVERDUE }
                  : {
                      OR: [
                        { title: { contains: kw, mode: 'insensitive' } },
                        { evidence: { contains: kw, mode: 'insensitive' } },
                      ],
                    },
              ],
            },
            take: 30,
            select: {
              id: true,
              title: true,
              status: true,
              dueDate: true,
              matter: { select: { diaryNo: true } },
              owner: { select: { displayName: true } },
            },
          }),
      intent.kind === 'directions' || intent.kind === 'overdue' || intent.kind === 'people'
        ? Promise.resolve([])
        : this.prisma.meeting.findMany({
            where: {
              AND: [
                meetingScope,
                {
                  OR: [
                    { title: { contains: kw, mode: 'insensitive' } },
                    { brief: { contains: kw, mode: 'insensitive' } },
                    { location: { contains: kw, mode: 'insensitive' } },
                    { minutes: { contains: kw, mode: 'insensitive' } },
                  ],
                },
              ],
            },
            take: 20,
            select: {
              id: true,
              title: true,
              status: true,
              startAt: true,
              location: true,
            },
          }),
    ]);

    const kwLower = kw.toLowerCase();
    const matterMap = new Map<string, (typeof mattersMeta)[number]>();
    for (const m of [...mattersMeta, ...mattersBody, ...mattersOcr]) {
      matterMap.set(m.id, m);
    }
    const matters = [...matterMap.values()].sort((a, b) => {
      const aExact = a.diaryNo.toLowerCase() === kwLower ? 0 : 1;
      const bExact = b.diaryNo.toLowerCase() === kwLower ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aPrefix = a.diaryNo.toLowerCase().startsWith(kwLower) ? 0 : 1;
      const bPrefix = b.diaryNo.toLowerCase().startsWith(kwLower) ? 0 : 1;
      return aPrefix - bPrefix;
    });

    // Always include overdue directions when intent is general and query mentions pending work
    let extraDirections = directions;
    if (intent.kind === 'general' && /\bpending\b|\bdue\b/.test(term.toLowerCase())) {
      const more = await this.prisma.direction.findMany({
        where: {
          ...directionScope,
          status: {
            in: [
              DirectionStatus.ISSUED,
              DirectionStatus.IN_PROGRESS,
              DirectionStatus.OVERDUE,
            ],
          },
        },
        take: 15,
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          matter: { select: { diaryNo: true } },
          owner: { select: { displayName: true } },
        },
      });
      const ids = new Set(extraDirections.map((d) => d.id));
      extraDirections = [...extraDirections, ...more.filter((d) => !ids.has(d.id))];
    }

    return {
      intent,
      matters,
      people,
      workItems,
      directions: extraDirections,
      meetings,
      note:
        intent.kind !== 'general'
          ? `Interpreted as ${intent.kind} search` +
            (intent.keywords !== term ? ` · keywords: “${intent.keywords}”` : '')
          : 'Permission-aware keyword search (min 3 chars; ILIKE on indexed fields — PostgreSQL FTS planned)',
    };
  }
}
