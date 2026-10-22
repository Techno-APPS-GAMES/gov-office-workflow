import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Classification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { scanUpload } from '../storage/virus-scan.hook';
import { assertMatterReadable, sanitizeFilename } from '../auth/access';

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
]);

const EXEC_ROLES: Role[] = [
  Role.SPEAKER,
  Role.SECRETARY_GENERAL,
  Role.SPECIAL_SECRETARY,
  Role.ADMIN,
];

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private crypto: CryptoService,
  ) {}

  private seal(plain: string) {
    if (!plain) return { stored: '', textEnc: true };
    return { stored: this.crypto.encryptSecret(plain), textEnc: true };
  }

  private open(stored: string, textEnc: boolean) {
    if (!stored) return '';
    if (!textEnc) return stored;
    try {
      return this.crypto.decryptSecret(stored);
    } catch {
      return stored;
    }
  }

  private decryptVerified(stored: string, textEnc: boolean) {
    if (!textEnc || !stored) return true;
    try {
      this.crypto.decryptSecret(stored);
      return true;
    } catch {
      return false;
    }
  }

  private async assertVaultAccess(matterId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) return;
    const grant = await this.prisma.vaultGrant.findFirst({
      where: { matterId, userId, expiresAt: { gt: new Date() } },
    });
    if (!grant) throw new ForbiddenException('Confidential matter locked — unlock vault first');
  }

  private previewText(text: string, attachmentCount: number) {
    const t = (text || '').trim();
    if (t) return t.length > 80 ? `${t.slice(0, 80)}…` : t;
    if (attachmentCount === 1) return '📎 Attachment';
    if (attachmentCount > 1) return `📎 ${attachmentCount} attachments`;
    return '(empty)';
  }

  private mapMessage<T extends { text: string; textEnc: boolean }>(m: T) {
    const encryptedAtRest = Boolean(m.textEnc && m.text);
    return {
      ...m,
      text: this.open(m.text, m.textEnc),
      encrypted: encryptedAtRest,
      encryptedAtRest,
      verified: encryptedAtRest ? this.decryptVerified(m.text, m.textEnc) : true,
    };
  }

  async contacts(userId: string, q?: string) {
    const officers = await this.prisma.user.findMany({
      where: {
        active: true,
        id: { not: userId },
        role: { in: EXEC_ROLES },
      },
      select: { id: true, displayName: true, role: true, username: true, email: true },
      orderBy: { displayName: 'asc' },
    });

    const convos = await this.conversations(userId, q);
    const byId = new Map(convos.map((c) => [c.peer.id, c]));

    let list = officers.map((o) => {
      const c = byId.get(o.id);
      return {
        peer: o,
        lastText: c?.lastText || 'No messages yet',
        lastAt: c?.lastAt || null,
        unread: c?.unread || 0,
      };
    });

    // Include anyone you've messaged who isn't in EXEC_ROLES
    for (const c of convos) {
      if (!list.some((x) => x.peer.id === c.peer.id)) {
        list.push({
          peer: c.peer as typeof officers[0],
          lastText: c.lastText,
          lastAt: c.lastAt,
          unread: c.unread,
        });
      }
    }

    const term = (q || '').trim().toLowerCase();
    if (term) {
      list = list.filter(
        (c) =>
          c.peer.displayName.toLowerCase().includes(term) ||
          c.peer.username.toLowerCase().includes(term) ||
          c.peer.role.toLowerCase().includes(term) ||
          c.lastText.toLowerCase().includes(term),
      );
    }

    return list.sort((a, b) => {
      if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return a.peer.displayName.localeCompare(b.peer.displayName);
    });
  }

  async conversations(userId: string, q?: string) {
    const rows = await this.prisma.message.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        fromUser: { select: { id: true, displayName: true, role: true, username: true } },
        toUser: { select: { id: true, displayName: true, role: true, username: true } },
        attachments: { select: { id: true } },
      },
      take: 80,
    });

    const byPeer = new Map<
      string,
      {
        peer: { id: string; displayName: string; role: string; username: string };
        lastText: string;
        lastAt: string;
        unread: number;
      }
    >();

    for (const m of rows) {
      const peer = m.fromUserId === userId ? m.toUser : m.fromUser;
      if (!peer || peer.id === userId) continue;
      const plain = this.open(m.text, m.textEnc);
      const existing = byPeer.get(peer.id);
      if (!existing) {
        byPeer.set(peer.id, {
          peer,
          lastText: this.previewText(plain, m.attachments.length),
          lastAt: m.createdAt.toISOString(),
          unread: m.toUserId === userId && !m.read ? 1 : 0,
        });
      } else if (m.toUserId === userId && !m.read) {
        existing.unread += 1;
      }
    }

    let list = [...byPeer.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    const term = (q || '').trim().toLowerCase();
    if (term) {
      list = list.filter(
        (c) =>
          c.peer.displayName.toLowerCase().includes(term) ||
          c.peer.username.toLowerCase().includes(term) ||
          c.lastText.toLowerCase().includes(term),
      );
    }
    return list;
  }

  async thread(userId: string, peerId: string) {
    const peer = await this.prisma.user.findUnique({
      where: { id: peerId },
      select: { id: true, displayName: true, role: true, username: true, email: true },
    });
    if (!peer) throw new NotFoundException('User not found');

    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { fromUserId: userId, toUserId: peerId },
          { fromUserId: peerId, toUserId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        fromUser: { select: { id: true, displayName: true, role: true } },
        toUser: { select: { id: true, displayName: true } },
        matter: { select: { id: true, diaryNo: true, subject: true } },
        attachments: {
          select: { id: true, fileName: true, contentType: true, sizeBytes: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    await this.prisma.message.updateMany({
      where: { fromUserId: peerId, toUserId: userId, read: false },
      data: { read: true },
    });

    const verified = messages.every(
      (m) => !m.textEnc || !m.text || this.decryptVerified(m.text, m.textEnc),
    );
    return {
      peer,
      encryption: {
        algorithm: 'AES-256-GCM',
        mode: 'encrypted-at-rest',
        verified,
      },
      messages: messages.map((m) => this.mapMessage(m)),
    };
  }

  private assertAllowedFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Empty file');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`"${file.originalname}" exceeds 15 MB limit`);
    }
    const type = file.mimetype || 'application/octet-stream';
    if (!ALLOWED.has(type)) {
      throw new BadRequestException(
        `File type not allowed: ${file.originalname} (${type}). Use images, PDF, Office, or text.`,
      );
    }
  }

  async send(
    user: { id: string; role: Role },
    data: {
      toUserId: string;
      text?: string;
      priority?: string;
      matterId?: string;
    },
    files: Express.Multer.File[] = [],
  ) {
    const fromUserId = user.id;
    if (data.toUserId === fromUserId) {
      throw new ForbiddenException('Cannot message yourself');
    }
    const text = (data.text || '').trim();
    if (!text && (!files || files.length === 0)) {
      throw new BadRequestException('Write a message or attach a file');
    }
    if (files.length > MAX_FILES) {
      throw new BadRequestException(`Maximum ${MAX_FILES} files per message`);
    }

    const priority = (data.priority || 'ROUTINE').toUpperCase();
    if (!['ROUTINE', 'URGENT'].includes(priority)) {
      throw new BadRequestException('Priority must be ROUTINE or URGENT');
    }

    const target = await this.prisma.user.findUnique({ where: { id: data.toUserId } });
    if (!target || !target.active) throw new NotFoundException('Recipient not found');

    if (data.matterId) {
      const matter = await this.prisma.matter.findUnique({ where: { id: data.matterId } });
      if (!matter) throw new BadRequestException('Linked matter not found');
      assertMatterReadable(matter, user);
      if (matter.classification === Classification.CONFIDENTIAL) {
        await this.assertVaultAccess(matter.id, user.id, user.role);
      }
    }

    for (const f of files) this.assertAllowedFile(f);

    const attachmentRows: {
      fileName: string;
      contentType: string;
      sizeBytes: number;
      storageKey: string;
      sha256: string;
    }[] = [];

    for (const file of files) {
      const scan = await scanUpload(file.buffer, file.originalname);
      if (!scan.clean) {
        throw new BadRequestException(`Upload rejected by virus scan (${scan.engine})`);
      }
      const sha256 = createHash('sha256').update(file.buffer).digest('hex');
      const storageKey = await this.storage.putObject(
        file.buffer,
        file.mimetype || 'application/octet-stream',
        'messages',
      );
      attachmentRows.push({
        fileName: sanitizeFilename(file.originalname),
        contentType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        storageKey,
        sha256,
      });
    }

    const sealed = this.seal(text);
    const msg = await this.prisma.message.create({
      data: {
        fromUserId,
        toUserId: data.toUserId,
        text: sealed.stored,
        textEnc: sealed.textEnc,
        priority,
        matterId: data.matterId || null,
        attachments: attachmentRows.length ? { create: attachmentRows } : undefined,
      },
      include: {
        attachments: {
          select: { id: true, fileName: true, contentType: true, sizeBytes: true },
        },
        matter: { select: { id: true, diaryNo: true, subject: true } },
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: data.toUserId,
        type: 'MESSAGE',
        title: priority === 'URGENT' ? 'Urgent office message' : 'New office message',
        body: this.previewText(text, attachmentRows.length).slice(0, 200),
        recordId: msg.id,
      },
    });
    await this.audit.record({
      actorId: fromUserId,
      action: 'MESSAGE_SEND',
      entityType: 'Message',
      entityId: msg.id,
      summary: `Message sent (encrypted at rest)${data.matterId ? ' with matter link' : ''}${
        priority === 'URGENT' ? ' (URGENT)' : ''
      }`,
    });

    return this.mapMessage(msg);
  }

  async downloadAttachment(attachmentId: string, userId: string) {
    const att = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      include: { message: true },
    });
    if (!att) throw new NotFoundException();
    const m = att.message;
    if (m.fromUserId !== userId && m.toUserId !== userId) {
      throw new ForbiddenException('No access to this attachment');
    }
    const bytes = await this.storage.getObject(att.storageKey);
    await this.audit.record({
      actorId: userId,
      action: 'MESSAGE_ATTACHMENT_DOWNLOAD',
      entityType: 'MessageAttachment',
      entityId: att.id,
      summary: `Downloaded message file ${att.fileName}`,
    });
    return {
      bytes,
      fileName: sanitizeFilename(att.fileName),
      contentType: att.contentType,
    };
  }

  async markRead(id: string, userId: string) {
    return this.prisma.message.updateMany({
      where: { id, toUserId: userId },
      data: { read: true },
    });
  }
}
