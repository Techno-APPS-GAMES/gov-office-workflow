import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function stripVersionMarker(body: string) {
  return body.replace(/\n?<!--gow-ver:\d+-->/g, '').trimEnd();
}

function versionOf(body: string) {
  const m = body.match(/<!--gow-ver:(\d+)-->/);
  return m ? Number(m[1]) : 1;
}

function withVersion(body: string, version: number) {
  return `${stripVersionMarker(body)}\n<!--gow-ver:${version}-->`;
}

@Injectable()
export class SpeechesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list() {
    return this.prisma.speech.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { author: { select: { displayName: true } } },
    });
  }

  async get(id: string) {
    const s = await this.prisma.speech.findUnique({
      where: { id },
      include: { author: { select: { displayName: true } } },
    });
    if (!s) throw new NotFoundException('Speech not found');
    return s;
  }

  async create(
    authorId: string,
    data: { title: string; body: string; language?: string; eventDate?: string },
  ) {
    const s = await this.prisma.speech.create({
      data: {
        authorId,
        title: data.title,
        body: withVersion(data.body, 1),
        language: data.language || 'en',
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        status: 'DRAFT',
      },
      include: { author: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorId: authorId,
      action: 'SPEECH_CREATE',
      entityType: 'Speech',
      entityId: s.id,
      summary: `Speech drafted: ${s.title}`,
    });
    return s;
  }

  async update(
    id: string,
    actorId: string,
    data: { title?: string; body?: string; language?: string },
  ) {
    const existing = await this.prisma.speech.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Speech not found');

    const bodyChanged =
      data.body !== undefined &&
      stripVersionMarker(data.body) !== stripVersionMarker(existing.body);
    const nextVersion = bodyChanged ? versionOf(existing.body) + 1 : versionOf(existing.body);
    const nextBody =
      data.body !== undefined ? withVersion(data.body, nextVersion) : existing.body;

    const s = await this.prisma.speech.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        body: nextBody,
        language: data.language ?? existing.language,
        status:
          bodyChanged && (existing.status === 'APPROVED' || existing.status === 'SUBMITTED')
            ? 'DRAFT'
            : existing.status,
      },
      include: { author: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorId,
      action: 'SPEECH_UPDATE',
      entityType: 'Speech',
      entityId: id,
      summary: `Speech updated: ${s.title}`,
    });
    return s;
  }

  async setStatus(id: string, actorId: string, status: string) {
    const normalized = (status || '').toUpperCase();
    const s = await this.prisma.speech.update({
      where: { id },
      data: { status: normalized },
      include: { author: { select: { displayName: true } } },
    });
    await this.audit.record({
      actorId,
      action: 'SPEECH_STATUS',
      entityType: 'Speech',
      entityId: id,
      summary: `Speech ${s.title} → ${normalized}`,
    });
    return s;
  }
}
