import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Classification, MatterStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { scanUpload } from '../storage/virus-scan.hook';
import { assertMatterReadable, canSeeAllMatters } from '../auth/access';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private storage: StorageService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private async journey(matterId: string, kind: string, summary: string, actorId?: string) {
    await this.prisma.journeyEvent.create({
      data: { matterId, kind, summary, actorId },
    });
  }

  async list(user: { id: string; role: Role }) {
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
    const where = canSeeAllMatters(user.role)
      ? user.role === Role.ADMIN
        ? {}
        : grantOk
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
              grantOk,
            ],
          };
    const rows = await this.prisma.matter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        holder: { select: { id: true, displayName: true, role: true } },
        assignee: { select: { id: true, displayName: true, role: true } },
        createdBy: { select: { displayName: true } },
        vaultGrants: {
          where: { userId: user.id, expiresAt: { gt: new Date() } },
          take: 1,
          select: { id: true, expiresAt: true },
        },
        _count: { select: { attachments: true, routeSteps: true, letters: true } },
      },
    });
    return rows.map((m) => ({
      ...m,
      vaultUnlocked: user.role === Role.ADMIN || (m.vaultGrants?.length || 0) > 0,
      vaultGrants: undefined,
    }));
  }

  async dispatchedLetters(user: { id: string; role: Role }) {
    const canSee =
      user.role === Role.SPEAKER ||
      user.role === Role.ADMIN ||
      user.role === Role.SECRETARY_GENERAL ||
      user.role === Role.SPECIAL_SECRETARY;
    if (!canSee) return [];
    return this.prisma.letter.findMany({
      where: { status: 'DISPATCHED' },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      include: {
        matter: { select: { id: true, diaryNo: true, subject: true } },
      },
    });
  }

  async get(id: string, user: { id: string; role: Role }) {
    const matter = await this.prisma.matter.findUnique({
      where: { id },
      include: {
        holder: { select: { id: true, displayName: true, role: true } },
        assignee: { select: { id: true, displayName: true, role: true } },
        createdBy: { select: { id: true, displayName: true, role: true } },
        versions: { orderBy: { createdAt: 'asc' }, include: { author: { select: { displayName: true } } } },
        notes: { orderBy: { number: 'asc' }, include: { author: { select: { displayName: true } } } },
        attachments: true,
        routeSteps: {
          orderBy: { createdAt: 'asc' },
          include: {
            fromUser: { select: { id: true, displayName: true, role: true } },
            toUser: { select: { id: true, displayName: true, role: true } },
          },
        },
        journeyEvents: { orderBy: { createdAt: 'asc' } },
        letters: true,
        directions: true,
        relatedFrom: { include: { toMatter: { select: { id: true, diaryNo: true, subject: true } } } },
      },
    });
    if (!matter) throw new NotFoundException('Matter not found');
    assertMatterReadable(matter, user);
    if (matter.classification === Classification.CONFIDENTIAL) {
      await this.assertVaultAccess(matter.id, user.id, user.role);
    }
    return matter;
  }

  async assertVaultAccess(matterId: string, userId: string, role: Role) {
    // Only ADMIN may bypass unlock; everyone else needs a live grant (including Speaker / DG IT).
    if (role === Role.ADMIN) return;
    const grant = await this.prisma.vaultGrant.findFirst({
      where: { matterId, userId, expiresAt: { gt: new Date() } },
    });
    if (!grant) throw new ForbiddenException('Confidential matter locked — unlock vault first');
  }

  async assertCanMutateMatter(matterId: string, user: { id: string; role: Role }) {
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    assertMatterReadable(matter, user);
    if (matter.classification === Classification.CONFIDENTIAL) {
      await this.assertVaultAccess(matterId, user.id, user.role);
    }
    return matter;
  }

  async register(
    user: { id: string; role: Role },
    input: {
      subject: string;
      sender: string;
      body: string;
      classification: Classification;
      subjectArea: string;
      priority?: string;
      filePassword?: string;
    },
  ) {
    if (input.classification === Classification.CONFIDENTIAL && !input.filePassword) {
      throw new BadRequestException('Confidential matters require a file password');
    }
    if (input.filePassword && input.filePassword.length < 12) {
      throw new BadRequestException('File password must be at least 12 characters');
    }
    const count = await this.prisma.matter.count();
    const diaryNo = `GOW-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const matter = await this.prisma.matter.create({
      data: {
        diaryNo,
        subject: input.subject,
        sender: input.sender,
        body: input.body,
        classification: input.classification,
        subjectArea: input.subjectArea,
        priority: input.priority || 'NORMAL',
        status: MatterStatus.OPEN,
        createdById: user.id,
        holderId: user.id,
        filePasswordHash: input.filePassword
          ? await this.crypto.hashPassword(input.filePassword)
          : null,
        versions: {
          create: {
            authorId: user.id,
            text: input.body,
            reason: 'Initial registration',
            kind: 'ORIGINAL',
            hash: this.crypto.sha256(input.body),
          },
        },
      },
    });
    await this.journey(matter.id, 'REGISTERED', `Matter ${diaryNo} registered`, user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'MATTER_REGISTER',
      entityType: 'Matter',
      entityId: matter.id,
      summary: `Registered ${diaryNo}: ${matter.subject}`,
    });
    if (input.classification === Classification.CONFIDENTIAL && input.filePassword) {
      const minutes = Number(process.env.VAULT_UNLOCK_TTL_MINUTES || 30);
      await this.prisma.vaultGrant.create({
        data: {
          matterId: matter.id,
          userId: user.id,
          expiresAt: new Date(Date.now() + minutes * 60_000),
        },
      });
    }
    return matter;
  }

  async addAttachment(
    matterId: string,
    user: { id: string; role: Role },
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('File required');
    const scan = await scanUpload(file.buffer, file.originalname);
    if (!scan.clean) throw new BadRequestException(`Upload rejected by virus scan (${scan.engine})`);
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    if (matter.classification === Classification.CONFIDENTIAL) {
      await this.assertVaultAccess(matterId, user.id, user.role);
    }
    const encrypt = matter.classification === Classification.CONFIDENTIAL;
    let storageBytes = file.buffer;
    let wrappedDek: string | undefined;
    let sha256 = this.crypto.sha256(file.buffer);
    if (encrypt) {
      const enc = this.crypto.encryptFile(file.buffer);
      storageBytes = enc.ciphertext;
      wrappedDek = enc.wrappedDek;
      sha256 = enc.sha256;
    }
    const storageKey = await this.storage.putObject(storageBytes, file.mimetype);
    const att = await this.prisma.attachment.create({
      data: {
        matterId,
        fileName: file.originalname,
        contentType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        sha256,
        encrypted: encrypt,
        wrappedDek,
      },
    });
    await this.journey(matterId, 'ATTACHMENT', `Added ${file.originalname}`, user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'ATTACHMENT_ADD',
      entityType: 'Attachment',
      entityId: att.id,
      summary: `Attachment ${file.originalname} on ${matter.diaryNo}`,
    });
    return att;
  }

  async downloadAttachment(attachmentId: string, user: { id: string; role: Role }) {
    const att = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { matter: true },
    });
    if (!att) throw new NotFoundException();
    if (att.matter.classification === Classification.CONFIDENTIAL) {
      await this.assertVaultAccess(att.matterId, user.id, user.role);
    }
    let bytes = await this.storage.getObject(att.storageKey);
    if (att.encrypted && att.wrappedDek) {
      bytes = this.crypto.decryptFile(bytes, att.wrappedDek);
    }
    await this.audit.record({
      actorId: user.id,
      action: 'ATTACHMENT_DOWNLOAD',
      entityType: 'Attachment',
      entityId: att.id,
      summary: `Downloaded ${att.fileName}`,
    });
    return { bytes, fileName: att.fileName, contentType: att.contentType };
  }

  async route(
    matterId: string,
    user: { id: string; role: Role },
    input: { toUserId: string; procedure: string; dueDate?: string; remarks?: string },
  ) {
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    if (matter.holderId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the current holder can route this matter');
    }
    const step = await this.prisma.routeStep.create({
      data: {
        matterId,
        fromUserId: user.id,
        toUserId: input.toUserId,
        procedure: input.procedure,
        remarks: input.remarks,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: 'AWAITING_RECEIPT',
      },
    });
    await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        status: MatterStatus.AWAITING_RECEIPT,
        assigneeId: input.toUserId,
        // holder stays with sender until receipt is acknowledged
      },
    });
    await this.journey(
      matterId,
      'ROUTED',
      `Routed for ${input.procedure}`,
      user.id,
    );
    await this.notifications.create(
      input.toUserId,
      'routing',
      'File handoff',
      `${matter.diaryNo} awaits your receipt`,
      matterId,
    );
    await this.audit.record({
      actorId: user.id,
      action: 'MATTER_ROUTE',
      entityType: 'Matter',
      entityId: matterId,
      summary: `Routed ${matter.diaryNo} to user ${input.toUserId}`,
    });
    return step;
  }

  async acknowledge(matterId: string, user: { id: string }) {
    const step = await this.prisma.routeStep.findFirst({
      where: { matterId, toUserId: user.id, status: 'AWAITING_RECEIPT' },
      orderBy: { createdAt: 'desc' },
    });
    if (!step) throw new BadRequestException('No pending receipt');
    await this.prisma.routeStep.update({
      where: { id: step.id },
      data: { status: 'IN_PROGRESS', acknowledgedAt: new Date() },
    });
    await this.prisma.matter.update({
      where: { id: matterId },
      data: { status: MatterStatus.IN_PROGRESS, holderId: user.id },
    });
    await this.journey(matterId, 'RECEIPT', 'Receipt acknowledged', user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'MATTER_ACK',
      entityType: 'Matter',
      entityId: matterId,
      summary: 'Receipt acknowledged',
    });
    return { ok: true };
  }

  async completeProcedure(matterId: string, user: { id: string }, outcome: string) {
    const step = await this.prisma.routeStep.findFirst({
      where: { matterId, toUserId: user.id, status: 'IN_PROGRESS' },
      orderBy: { createdAt: 'desc' },
    });
    if (!step) throw new BadRequestException('No in-progress procedure');
    await this.prisma.routeStep.update({
      where: { id: step.id },
      data: { status: 'COMPLETED', outcome, completedAt: new Date() },
    });
    await this.prisma.matter.update({
      where: { id: matterId },
      data: { status: MatterStatus.AWAITING_DECISION },
    });
    await this.journey(matterId, 'PROCEDURE', `Completed: ${outcome}`, user.id);
    return { ok: true };
  }

  async decide(
    matterId: string,
    user: { id: string; role: Role },
    input: {
      text: string;
      decisionType: string;
      directionTitle?: string;
      ownerUserId?: string;
      dueDate?: string;
    },
  ) {
    if (user.role !== Role.SPEAKER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only Speaker can record decisions');
    }
    const matter = await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        decisionText: input.text,
        decisionType: input.decisionType,
        status:
          input.decisionType === 'NO_FURTHER_ACTION' ? MatterStatus.CLOSED : MatterStatus.IN_PROGRESS,
        closedAt: input.decisionType === 'NO_FURTHER_ACTION' ? new Date() : null,
      },
    });
    let direction = null;
    if (input.decisionType === 'DIRECTION' && input.directionTitle && input.ownerUserId) {
      direction = await this.prisma.direction.create({
        data: {
          matterId,
          title: input.directionTitle,
          ownerId: input.ownerUserId,
          createdById: user.id,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        },
      });
      await this.notifications.create(
        input.ownerUserId,
        'direction',
        'New direction',
        input.directionTitle,
        direction.id,
      );
    }
    await this.journey(matterId, 'DECISION', `${input.decisionType}: ${input.text.slice(0, 120)}`, user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'MATTER_DECISION',
      entityType: 'Matter',
      entityId: matterId,
      summary: `Decision ${input.decisionType} on ${matter.diaryNo}`,
    });
    return { matter, direction };
  }

  async addVersion(matterId: string, user: { id: string; role: Role }, text: string, reason: string) {
    await this.assertCanMutateMatter(matterId, user);
    const version = await this.prisma.matterVersion.create({
      data: {
        matterId,
        authorId: user.id,
        text,
        reason,
        hash: this.crypto.sha256(text),
      },
    });
    await this.prisma.matter.update({ where: { id: matterId }, data: { body: text } });
    await this.journey(matterId, 'VERSION', reason, user.id);
    return version;
  }

  async addNote(matterId: string, user: { id: string; role: Role }, text: string) {
    await this.assertCanMutateMatter(matterId, user);
    const number = (await this.prisma.matterNote.count({ where: { matterId } })) + 1;
    return this.prisma.matterNote.create({
      data: { matterId, authorId: user.id, text, number },
    });
  }

  async linkRelated(matterId: string, relatedId: string, user: { id: string; role: Role }) {
    await this.assertCanMutateMatter(matterId, user);
    return this.prisma.matterRelation.create({
      data: { fromMatterId: matterId, toMatterId: relatedId },
    });
  }

  async createLetter(
    matterId: string,
    user: { id: string; role: Role },
    recipient: string,
    text: string,
  ) {
    await this.assertCanMutateMatter(matterId, user);
    return this.prisma.letter.create({
      data: { matterId, recipient, text, status: 'DRAFT' },
    });
  }

  async dispatchLetter(letterId: string, user: { id: string; role: Role }) {
    const letter = await this.prisma.letter.findUniqueOrThrow({ where: { id: letterId } });
    await this.assertCanMutateMatter(letter.matterId, user);
    return this.prisma.letter.update({
      where: { id: letterId },
      data: { status: 'DISPATCHED', method: 'INTERNAL', reference: `LTR-${Date.now()}` },
    });
  }

  async close(matterId: string, user: { id: string; role: Role }, outcome?: string) {
    if (user.role !== Role.SPEAKER && user.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }
    const matter = await this.prisma.matter.update({
      where: { id: matterId },
      data: { status: MatterStatus.CLOSED, closedAt: new Date() },
    });
    await this.journey(matterId, 'CLOSED', outcome || 'Matter closed', user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'MATTER_CLOSE',
      entityType: 'Matter',
      entityId: matterId,
      summary: `Closed ${matter.diaryNo}`,
    });
    return matter;
  }
}
