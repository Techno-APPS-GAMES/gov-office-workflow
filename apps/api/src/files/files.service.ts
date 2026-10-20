import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Classification, DirectionStatus, MatterStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { scanUpload } from '../storage/virus-scan.hook';
import { assertMatterReadable, canSeeAllMatters } from '../auth/access';
import { DakService } from '../dak/dak.service';
import { OcrService } from '../ocr/ocr.service';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private storage: StorageService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private dak: DakService,
    @Inject(forwardRef(() => OcrService)) private ocr: OcrService,
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
        notes: {
          orderBy: { number: 'asc' },
          include: { author: { select: { displayName: true, role: true } } },
        },
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
            reason: 'Original text layer at registration',
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
    const registrar = await this.prisma.user.findUnique({ where: { id: user.id } });
    await this.dak.stampIn(user, {
      fromName: input.sender,
      toName: registrar?.displayName,
      toDesignation: user.role,
      channel: 'HAND',
      subject: input.subject,
      classification: input.classification,
      diaryNo: matter.diaryNo,
      matterId: matter.id,
      branchName: 'Speaker Office',
    });
    return matter;
  }

  /** Speaker put-up completeness checklist (research / Tech presentation quality). */
  async putUpCheck(matterId: string, user: { id: string; role: Role }) {
    const matter = await this.get(matterId, user);
    const summaryOk = !matter.aiSummary || Boolean(matter.aiSummaryAcceptedAt);
    const checks = [
      {
        id: 'subject',
        label: 'Subject present',
        ok: Boolean(matter.subject?.trim()),
      },
      {
        id: 'body',
        label: 'Correspondence body present (≥20 chars)',
        ok: Boolean(matter.body?.trim()) && matter.body.trim().length >= 20,
      },
      {
        id: 'classification',
        label: 'Classification set',
        ok: Boolean(matter.classification),
      },
      {
        id: 'attachment_or_note',
        label: 'At least one attachment or noting para',
        ok: (matter.attachments?.length || 0) > 0 || (matter.notes?.length || 0) > 0,
      },
      {
        id: 'summary_reviewed',
        label: matter.aiSummary
          ? matter.aiSummaryAcceptedAt
            ? 'Summary accepted by human reviewer'
            : 'AI summary awaiting human accept'
          : 'Summary optional until generated',
        ok: summaryOk,
      },
    ];
    return { ready: checks.every((c) => c.ok), checks, diaryNo: matter.diaryNo };
  }

  async generateSummary(
    matterId: string,
    user: { id: string; role: Role },
    lang: 'en' | 'ur' = 'en',
  ) {
    const matter = await this.assertCanMutateMatter(matterId, user);
    const urdu = lang === 'ur';
    const summary = urdu
      ? `خلاصہ (خودکار — انسانی قبولیت درکار)\nڈائری: ${matter.diaryNo}\nموضوع: ${matter.subject}\nارسال کنندہ: ${matter.sender}\nدرجہ بندی: ${matter.classification}\n\n${matter.body.slice(0, 800)}${matter.body.length > 800 ? '…' : ''}`
      : `Auto summary (requires human accept)\nDiary: ${matter.diaryNo}\nSubject: ${matter.subject}\nSender: ${matter.sender}\nClassification: ${matter.classification}\nPriority: ${matter.priority}\n\nExcerpt:\n${matter.body.slice(0, 800)}${matter.body.length > 800 ? '…' : ''}`;
    const updated = await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        aiSummary: summary,
        aiSummaryLang: lang,
        aiSummaryAcceptedAt: null,
        aiSummaryAcceptedById: null,
      },
    });
    await this.journey(matterId, 'AI_SUMMARY', `Summary generated (${lang}) — pending accept`, user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'AI_SUMMARY_GENERATE',
      entityType: 'Matter',
      entityId: matterId,
      summary: `AI summary generated (${lang}) for ${matter.diaryNo}`,
    });
    return updated;
  }

  async acceptSummary(matterId: string, user: { id: string; role: Role }, editedText?: string) {
    await this.assertCanMutateMatter(matterId, user);
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    if (!matter.aiSummary && !editedText?.trim()) {
      throw new BadRequestException('No summary to accept — generate one first');
    }
    const updated = await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        aiSummary: editedText?.trim() || matter.aiSummary,
        aiSummaryAcceptedAt: new Date(),
        aiSummaryAcceptedById: user.id,
      },
    });
    await this.journey(matterId, 'AI_SUMMARY_ACCEPTED', 'Summary accepted by human reviewer', user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'AI_SUMMARY_ACCEPT',
      entityType: 'Matter',
      entityId: matterId,
      summary: `Summary accepted on ${matter.diaryNo}`,
    });
    return updated;
  }

  listRouteTemplates() {
    return this.prisma.routeTemplate.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async applyRouteTemplate(
    matterId: string,
    user: { id: string; role: Role },
    templateId: string,
  ) {
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    if (matter.holderId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the current holder can apply a route template');
    }
    const template = await this.prisma.routeTemplate.findUnique({ where: { id: templateId } });
    if (!template || !template.active) throw new NotFoundException('Template not found');
    let steps: { toRole?: string; toUserId?: string; procedure: string }[] = [];
    try {
      steps = JSON.parse(template.stepsJson);
    } catch {
      throw new BadRequestException('Invalid template steps');
    }
    if (!steps.length) throw new BadRequestException('Template has no steps');
    const first = steps[0];
    let toUserId = first.toUserId;
    if (!toUserId && first.toRole) {
      const u = await this.prisma.user.findFirst({
        where: { role: first.toRole as Role, active: true },
      });
      if (!u) throw new BadRequestException(`No active user for role ${first.toRole}`);
      toUserId = u.id;
    }
    if (!toUserId) throw new BadRequestException('First template step has no target');
    const step = await this.route(matterId, user, {
      toUserId,
      procedure: first.procedure || template.name,
      remarks: `Template: ${template.name}` + (steps.length > 1 ? ` (step 1 of ${steps.length})` : ''),
    });
    if (steps.length > 1) {
      await this.journey(
        matterId,
        'ROUTE_TEMPLATE',
        `Applied "${template.name}" — remaining steps: ${steps
          .slice(1)
          .map((s) => s.toRole || s.toUserId)
          .join(' -> ')}`,
        user.id,
      );
    }
    return { step, template: template.name, remaining: steps.slice(1) };
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
    // Best-effort OCR on register/attach so full-text search gets content without a second click.
    if (String(process.env.OCR_ENABLED || 'true').toLowerCase() !== 'false') {
      try {
        await this.ocr.extractAttachment(att.id, user);
      } catch {
        /* OCR optional — manual re-run remains on file detail */
      }
    }
    return this.prisma.attachment.findUniqueOrThrow({ where: { id: att.id } });
  }

  async downloadAttachment(
    attachmentId: string,
    user: { id: string; role: Role },
    reason?: string,
  ) {
    const att = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { matter: true },
    });
    if (!att) throw new NotFoundException();
    if (att.matter.classification === Classification.CONFIDENTIAL) {
      await this.assertVaultAccess(att.matterId, user.id, user.role);
      if (!reason?.trim() || reason.trim().length < 5) {
        throw new BadRequestException(
          'Confidential downloads require a reason (min 5 characters)',
        );
      }
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
      summary: reason?.trim()
        ? `Downloaded ${att.fileName} — reason: ${reason.trim().slice(0, 200)}`
        : `Downloaded ${att.fileName}`,
    });
    return { bytes, fileName: att.fileName, contentType: att.contentType };
  }

  private parseDueDate(raw: string | undefined, required: boolean): Date | null {
    if (!raw) {
      if (required) throw new BadRequestException('Due date is required');
      return null;
    }
    const due = new Date(raw);
    if (Number.isNaN(due.getTime())) {
      throw new BadRequestException('Invalid due date');
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (due < startOfToday) {
      throw new BadRequestException('Due date cannot be in the past');
    }
    return due;
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
    const dueDate = this.parseDueDate(input.dueDate, false);
    const step = await this.prisma.routeStep.create({
      data: {
        matterId,
        fromUserId: user.id,
        toUserId: input.toUserId,
        procedure: input.procedure,
        remarks: input.remarks,
        dueDate,
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

  /**
   * Return custody to a previous officer (or explicit toUserId) with mandatory remarks.
   * Holder stays until the recipient acknowledges (same pattern as route).
   */
  async returnMatter(
    matterId: string,
    user: { id: string; role: Role },
    input: { remarks: string; toUserId?: string },
  ) {
    const remarks = (input.remarks || '').trim();
    if (remarks.length < 10) {
      throw new BadRequestException('Remarks must be at least 10 characters');
    }
    const matter = await this.prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
    if (matter.status === MatterStatus.CLOSED) {
      throw new BadRequestException('Cannot return a closed matter');
    }
    if (matter.holderId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the current holder can return this matter');
    }
    if (matter.classification === Classification.CONFIDENTIAL) {
      await this.assertVaultAccess(matterId, user.id, user.role);
    }
    if (matter.status === MatterStatus.AWAITING_RECEIPT) {
      throw new BadRequestException(
        'A handoff is already awaiting receipt — acknowledge it or wait before returning',
      );
    }

    let toUserId = input.toUserId;
    if (!toUserId) {
      const incoming = await this.prisma.routeStep.findFirst({
        where: {
          matterId,
          toUserId: user.id,
          status: { in: ['IN_PROGRESS', 'COMPLETED'] },
          fromUserId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      toUserId = incoming?.fromUserId || matter.createdById;
    }
    if (!toUserId || toUserId === user.id) {
      throw new BadRequestException(
        'No previous officer to return to — choose an officer explicitly',
      );
    }

    const openStep = await this.prisma.routeStep.findFirst({
      where: { matterId, toUserId: user.id, status: 'IN_PROGRESS' },
      orderBy: { createdAt: 'desc' },
    });
    if (openStep) {
      await this.prisma.routeStep.update({
        where: { id: openStep.id },
        data: {
          status: 'COMPLETED',
          outcome: `Returned: ${remarks.slice(0, 200)}`,
          completedAt: new Date(),
        },
      });
    }

    const step = await this.prisma.routeStep.create({
      data: {
        matterId,
        fromUserId: user.id,
        toUserId,
        procedure: 'RETURN',
        remarks,
        status: 'AWAITING_RECEIPT',
      },
    });
    await this.prisma.matter.update({
      where: { id: matterId },
      data: {
        status: MatterStatus.AWAITING_RECEIPT,
        assigneeId: toUserId,
      },
    });
    await this.journey(
      matterId,
      'RETURNED',
      `Returned: ${remarks.slice(0, 160)}`,
      user.id,
    );
    await this.notifications.create(
      toUserId,
      'routing',
      'File returned',
      `${matter.diaryNo} returned with remarks — awaiting your receipt`,
      matterId,
    );
    await this.audit.record({
      actorId: user.id,
      action: 'MATTER_RETURN',
      entityType: 'Matter',
      entityId: matterId,
      summary: `Returned ${matter.diaryNo} to user ${toUserId}`,
    });
    return step;
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
    let directionDue: Date | null = null;
    if (input.decisionType === 'DIRECTION') {
      if (!input.directionTitle?.trim()) {
        throw new BadRequestException('Direction title is required');
      }
      if (!input.ownerUserId) {
        throw new BadRequestException('Direction owner is required');
      }
      directionDue = this.parseDueDate(input.dueDate, true);
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
          dueDate: directionDue,
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
        kind: 'WORKING',
        hash: this.crypto.sha256(text),
      },
    });
    await this.prisma.matter.update({ where: { id: matterId }, data: { body: text } });
    await this.journey(matterId, 'VERSION', reason, user.id);
    return version;
  }

  /**
   * Documents & versions — OCR / text-layer snapshot (does not replace correspondence body).
   * Replaces prior OCR layer for the same file name so Re-run OCR updates Vn in place.
   */
  async recordOcrVersion(
    matterId: string,
    user: { id: string; role: Role },
    text: string,
    fileName: string,
    method?: string,
  ) {
    const reason = `OCR text layer from ${fileName}${method ? ` (${method})` : ''}`;
    const existing = await this.prisma.matterVersion.findFirst({
      where: {
        matterId,
        kind: 'OCR',
        reason: { contains: fileName },
      },
      orderBy: { createdAt: 'desc' },
    });
    const hash = this.crypto.sha256(text);
    if (existing) {
      return this.prisma.matterVersion.update({
        where: { id: existing.id },
        data: { text, reason, hash, authorId: user.id },
      });
    }
    const version = await this.prisma.matterVersion.create({
      data: {
        matterId,
        authorId: user.id,
        text,
        reason,
        kind: 'OCR',
        hash,
      },
    });
    await this.journey(matterId, 'OCR_LAYER', reason, user.id);
    return version;
  }

  async addNote(
    matterId: string,
    user: { id: string; role: Role },
    text: string,
    kind = 'NOTE',
  ) {
    await this.assertCanMutateMatter(matterId, user);
    const body = (text || '').trim();
    if (body.length < 3) {
      throw new BadRequestException('Note text is required');
    }
    const allowed = new Set(['NOTE', 'PUT_UP', 'OBSERVATION']);
    const noteKind = allowed.has(kind) ? kind : 'NOTE';
    const number = (await this.prisma.matterNote.count({ where: { matterId } })) + 1;
    const note = await this.prisma.matterNote.create({
      data: { matterId, authorId: user.id, text: body, number, kind: noteKind },
    });
    await this.journey(
      matterId,
      'NOTE',
      `Para #${number} (${noteKind}): ${body.slice(0, 120)}`,
      user.id,
    );
    await this.audit.record({
      actorId: user.id,
      action: 'MATTER_NOTE',
      entityType: 'Matter',
      entityId: matterId,
      summary: `Noting para #${number} (${noteKind})`,
    });
    return note;
  }

  async linkRelated(matterId: string, relatedId: string, user: { id: string; role: Role }) {
    await this.assertCanMutateMatter(matterId, user);
    if (!relatedId) throw new BadRequestException('Related matter is required');
    if (relatedId === matterId) {
      throw new BadRequestException('Cannot link a matter to itself');
    }
    const target = await this.prisma.matter.findUnique({ where: { id: relatedId } });
    if (!target) throw new NotFoundException('Related matter not found');
    assertMatterReadable(target, user);
    const existing = await this.prisma.matterRelation.findFirst({
      where: { fromMatterId: matterId, toMatterId: relatedId },
    });
    if (existing) throw new BadRequestException('Matters are already linked');
    const link = await this.prisma.matterRelation.create({
      data: { fromMatterId: matterId, toMatterId: relatedId },
    });
    await this.journey(
      matterId,
      'RELATED',
      `Linked to ${target.diaryNo}`,
      user.id,
    );
    return link;
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
    const letter = await this.prisma.letter.findUniqueOrThrow({
      where: { id: letterId },
      include: { matter: true },
    });
    await this.assertCanMutateMatter(letter.matterId, user);
    const reference = `LTR-${Date.now()}`;
    const updated = await this.prisma.letter.update({
      where: { id: letterId },
      data: { status: 'DISPATCHED', method: 'INTERNAL', reference },
    });
    await this.dak.stampOut(user, {
      toName: letter.recipient,
      subject: letter.matter.subject,
      classification: letter.matter.classification,
      diaryNo: letter.matter.diaryNo,
      matterId: letter.matterId,
      reference,
      channel: 'INTERNAL',
    });
    return updated;
  }

  async close(matterId: string, user: { id: string; role: Role }, outcome?: string) {
    if (user.role !== Role.SPEAKER && user.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }
    const openDirections = await this.prisma.direction.count({
      where: {
        matterId,
        status: { not: DirectionStatus.CLOSED },
      },
    });
    if (openDirections > 0) {
      throw new BadRequestException(
        `Cannot close matter while ${openDirections} direction(s) are still open — verify or close them first`,
      );
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
