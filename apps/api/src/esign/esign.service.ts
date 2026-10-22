import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
} from 'crypto';
import { Classification, EsignStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { canSeeAllMatters } from '../auth/access';

export type EsignMethod = 'LOCAL_PKI' | 'WET_INK';

/**
 * Pilot e-sign (consultation §3.5 remote review/approval + R-SIG-01/02).
 * LOCAL_PKI: RSA-SHA256 advanced-style seal under signer sole control (on-prem).
 * WET_INK: scanned wet signature path for excluded document types (R-SIG-03).
 * Accredited ECAC CSP / production PKI remains Tier B (ESIGN_PROVIDER=docusign|ecac).
 */
@Injectable()
export class EsignService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private async assertMatterForUser(matterId: string, user: { id: string; role: Role }) {
    const matter = await this.prisma.matter.findUnique({ where: { id: matterId } });
    if (!matter) throw new NotFoundException('Matter not found');
    if (matter.classification === Classification.CONFIDENTIAL && user.role !== Role.ADMIN) {
      const grant = await this.prisma.vaultGrant.findFirst({
        where: { matterId, userId: user.id, expiresAt: { gt: new Date() } },
      });
      if (!grant) throw new ForbiddenException('Vault unlock required for confidential e-sign');
    }
    if (
      !canSeeAllMatters(user.role) &&
      matter.createdById !== user.id &&
      matter.holderId !== user.id &&
      matter.assigneeId !== user.id
    ) {
      throw new ForbiddenException('No access to this matter');
    }
    return matter;
  }

  private include() {
    return {
      matter: {
        select: {
          id: true,
          diaryNo: true,
          subject: true,
          priority: true,
          status: true,
          classification: true,
          decisionText: true,
        },
      },
      signer: { select: { id: true, displayName: true, role: true } },
      requestedBy: { select: { id: true, displayName: true, role: true } },
    } as const;
  }

  async list(user: { id: string; role: Role }, matterId?: string) {
    if (matterId) {
      await this.assertMatterForUser(matterId, user);
      return this.prisma.esignRecord.findMany({
        where: { matterId },
        orderBy: { createdAt: 'desc' },
        include: this.include(),
      });
    }
    const canSeeAll = canSeeAllMatters(user.role);
    return this.prisma.esignRecord.findMany({
      where: canSeeAll ? undefined : { OR: [{ signerId: user.id }, { requestedById: user.id }] },
      orderBy: { createdAt: 'desc' },
      include: this.include(),
    });
  }

  async getOne(id: string, user: { id: string; role: Role }) {
    const rec = await this.prisma.esignRecord.findUnique({
      where: { id },
      include: this.include(),
    });
    if (!rec) throw new NotFoundException();
    if (
      !canSeeAllMatters(user.role) &&
      rec.signerId !== user.id &&
      rec.requestedById !== user.id
    ) {
      throw new ForbiddenException();
    }
    return rec;
  }

  private async nextCertId() {
    const year = new Date().getFullYear();
    const count = await this.prisma.esignRecord.count({
      where: { certId: { startsWith: `PK-NA-CERT-${year}-` } },
    });
    const n = String(count + 1).padStart(4, '0');
    return `PK-NA-CERT-${year}-${n}`;
  }

  /**
   * Canonical document snapshot hashed + signed.
   * Deliberately excludes wall-clock time so preview confirmHash matches sign
   * (signedAt is stored on the record / seal metadata, not inside the digest).
   */
  private buildPayload(input: {
    matterId: string;
    diaryNo: string;
    subject: string;
    decisionText: string | null;
    classification: string;
    signerId: string;
    certId: string;
    purpose: string | null;
    method: string;
  }) {
    return JSON.stringify({
      v: 1,
      matterId: input.matterId,
      diaryNo: input.diaryNo,
      subject: input.subject,
      decisionText: input.decisionText || '',
      classification: input.classification,
      signerId: input.signerId,
      certId: input.certId,
      purpose: input.purpose || '',
      method: input.method,
    });
  }

  private verifyLocalSeal(signatureJson: string) {
    const parsed = JSON.parse(signatureJson) as {
      digest?: string;
      payload?: string;
      signature?: string;
      publicKey?: string;
      algorithm?: string;
    };
    if (!parsed.payload || !parsed.digest || !parsed.signature || !parsed.publicKey) {
      return { valid: false, reason: 'Incomplete seal metadata', parsed };
    }
    const expected = createHash('sha256').update(parsed.payload).digest('hex');
    if (parsed.digest !== expected) {
      return { valid: false, reason: 'Document hash mismatch — content may have been altered', parsed };
    }
    try {
      const verifier = createVerify('SHA256');
      verifier.update(parsed.payload);
      verifier.end();
      const ok = verifier.verify(parsed.publicKey, parsed.signature, 'base64');
      return {
        valid: ok,
        reason: ok
          ? 'RSA-SHA256 signature and SHA-256 document hash verified'
          : 'RSA signature verification failed',
        parsed,
      };
    } catch {
      return { valid: false, reason: 'Could not verify RSA signature', parsed };
    }
  }

  async verify(certId: string) {
    const id = (certId || '').trim();
    if (!id) throw new BadRequestException('Enter a certificate ID');
    const rec = await this.prisma.esignRecord.findFirst({
      where: { certId: { equals: id, mode: 'insensitive' } },
      include: this.include(),
    });
    if (!rec) {
      throw new NotFoundException(
        `Certificate not found: ${id}. Copy an ID from the signed ledger (not a placeholder).`,
      );
    }
    if (rec.status === EsignStatus.REVOKED) {
      return {
        valid: false,
        certId: rec.certId,
        status: rec.status,
        method: rec.method,
        reason: rec.revokeReason || 'Certificate has been revoked',
        record: rec,
      };
    }
    if (rec.status === EsignStatus.DECLINED) {
      return {
        valid: false,
        certId: rec.certId,
        status: rec.status,
        method: rec.method,
        reason: rec.declineReason || 'Signer declined this seal request',
        record: rec,
      };
    }
    if (rec.status !== EsignStatus.SIGNED) {
      return {
        valid: false,
        certId: rec.certId,
        status: rec.status,
        method: rec.method,
        reason: 'Certificate is not in a signed state',
        record: rec,
      };
    }

    if (rec.method === 'WET_INK') {
      return {
        valid: true,
        certId: rec.certId,
        status: rec.status,
        method: rec.method,
        digest: rec.documentHash,
        signedAt: rec.signedAt,
        signer: rec.signer,
        matter: rec.matter,
        purpose: rec.purpose,
        reason: 'Wet-ink scan recorded (manual authenticity path — not cryptographic)',
        wetInkNote: rec.wetInkNote,
      };
    }

    if (!rec.signature) {
      return {
        valid: false,
        certId: rec.certId,
        status: rec.status,
        reason: 'Missing signature payload',
        record: rec,
      };
    }

    try {
      const check = this.verifyLocalSeal(rec.signature);
      return {
        valid: check.valid,
        certId: rec.certId,
        status: rec.status,
        method: rec.method,
        algorithm: rec.algorithm || check.parsed?.algorithm || 'RSA-SHA256',
        digest: check.parsed?.digest || rec.documentHash,
        signedAt: rec.signedAt,
        signer: rec.signer,
        matter: rec.matter,
        purpose: rec.purpose,
        provider: rec.provider,
        reason: check.reason,
      };
    } catch {
      return {
        valid: false,
        certId: rec.certId,
        status: rec.status,
        reason: 'Signature payload could not be parsed',
        record: rec,
      };
    }
  }

  async request(
    matterId: string,
    signerId: string,
    actor: { id: string; role: Role },
    opts?: { purpose?: string; method?: EsignMethod },
  ) {
    const matter = await this.assertMatterForUser(matterId, actor);
    const provider = process.env.ESIGN_PROVIDER || 'local_pki';
    if (provider === 'none') throw new BadRequestException('E-sign disabled');

    if (provider === 'docusign' && !process.env.DOCUSIGN_INTEGRATION_KEY) {
      throw new BadRequestException('DocuSign credentials not configured');
    }

    const signer = await this.prisma.user.findUnique({ where: { id: signerId } });
    if (!signer || !signer.active) throw new BadRequestException('Signer not found or inactive');

    const method: EsignMethod = opts?.method === 'WET_INK' ? 'WET_INK' : 'LOCAL_PKI';
    const purpose = (opts?.purpose || '').trim().slice(0, 500) || null;

    const rec = await this.prisma.esignRecord.create({
      data: {
        matterId,
        signerId,
        requestedById: actor.id,
        provider,
        method,
        purpose,
        algorithm: method === 'LOCAL_PKI' ? 'RSA-SHA256' : 'WET_INK',
        certId: await this.nextCertId(),
        status: EsignStatus.PENDING,
      },
      include: this.include(),
    });

    await this.prisma.matter.update({
      where: { id: matterId },
      data: { sentForEsign: true },
    });

    await this.notifications.create(
      signerId,
      'ESIGN',
      `Remote e-sign requested · ${matter.diaryNo}`,
      `${actor.role}: ${purpose || matter.subject}. Open Remote studio to review and seal.`,
      rec.id,
    );

    await this.audit.record({
      actorId: actor.id,
      action: 'ESIGN_REQUEST',
      entityType: 'EsignRecord',
      entityId: rec.id,
      summary: `E-sign requested for ${matter.diaryNo} (${method}) -> ${signer.displayName}`,
    });
    return rec;
  }

  async preview(id: string, signerId: string) {
    const rec = await this.prisma.esignRecord.findUnique({
      where: { id },
      include: { matter: true },
    });
    if (!rec) throw new NotFoundException();
    if (rec.signerId !== signerId) throw new ForbiddenException('Not the designated signer');
    if (rec.status !== EsignStatus.PENDING) throw new BadRequestException('Not pending');

    const payload = this.buildPayload({
      matterId: rec.matterId,
      diaryNo: rec.matter.diaryNo,
      subject: rec.matter.subject,
      decisionText: rec.matter.decisionText,
      classification: rec.matter.classification,
      signerId,
      certId: rec.certId || '',
      purpose: rec.purpose,
      method: rec.method,
    });
    const documentHash = createHash('sha256').update(payload).digest('hex');
    return {
      id: rec.id,
      certId: rec.certId,
      method: rec.method,
      purpose: rec.purpose,
      matter: {
        diaryNo: rec.matter.diaryNo,
        subject: rec.matter.subject,
        classification: rec.matter.classification,
        decisionText: rec.matter.decisionText,
        status: rec.matter.status,
      },
      documentHash,
      payloadPreview: payload,
      algorithm: rec.method === 'LOCAL_PKI' ? 'RSA-SHA256' : 'WET_INK',
    };
  }

  async sign(
    id: string,
    signerId: string,
    opts?: { wetInkNote?: string; confirmHash?: string },
  ) {
    const rec = await this.prisma.esignRecord.findUnique({
      where: { id },
      include: { matter: true },
    });
    if (!rec) throw new NotFoundException();
    if (rec.signerId !== signerId) throw new BadRequestException('Not the designated signer');
    if (rec.status !== EsignStatus.PENDING) throw new BadRequestException('Not pending');

    const signerUser = await this.prisma.user.findUnique({ where: { id: signerId } });
    if (!signerUser) throw new ForbiddenException('Signer not found');
    await this.assertMatterForUser(rec.matterId, { id: signerId, role: signerUser.role });

    const payload = this.buildPayload({
      matterId: rec.matterId,
      diaryNo: rec.matter.diaryNo,
      subject: rec.matter.subject,
      decisionText: rec.matter.decisionText,
      classification: rec.matter.classification,
      signerId,
      certId: rec.certId || '',
      purpose: rec.purpose,
      method: rec.method,
    });
    const documentHash = createHash('sha256').update(payload).digest('hex');

    if (opts?.confirmHash && opts.confirmHash !== documentHash) {
      throw new BadRequestException(
        'Document changed since preview — refresh the seal preview and try again',
      );
    }

    if (rec.method === 'WET_INK') {
      const note = (opts?.wetInkNote || '').trim();
      if (note.length < 8) {
        throw new BadRequestException('Wet-ink path requires a note (≥8 chars) describing the scan');
      }
      const updated = await this.prisma.esignRecord.update({
        where: { id },
        data: {
          status: EsignStatus.SIGNED,
          documentHash,
          wetInkNote: note.slice(0, 1000),
          algorithm: 'WET_INK',
          signature: JSON.stringify({
            method: 'WET_INK',
            digest: documentHash,
            payload,
            note,
          }),
          signedAt: new Date(),
        },
        include: this.include(),
      });
      if (rec.requestedById) {
        await this.notifications.create(
          rec.requestedById,
          'ESIGN',
          `Wet-ink seal recorded · ${rec.matter.diaryNo}`,
          `Signer recorded wet-ink confirmation. Cert ${rec.certId}`,
          id,
        );
      }
      await this.audit.record({
        actorId: signerId,
        action: 'ESIGN_SIGN',
        entityType: 'EsignRecord',
        entityId: id,
        summary: `Wet-ink seal ${rec.matter.diaryNo} (${rec.certId})`,
      });
      return updated;
    }

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signer = createSign('SHA256');
    signer.update(payload);
    signer.end();
    const signature = signer.sign(privateKey, 'base64');
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const updated = await this.prisma.esignRecord.update({
      where: { id },
      data: {
        status: EsignStatus.SIGNED,
        documentHash,
        algorithm: 'RSA-SHA256',
        signature: JSON.stringify({
          method: 'LOCAL_PKI',
          algorithm: 'RSA-SHA256',
          signature,
          publicKey: pubPem,
          digest: documentHash,
          payload,
        }),
        signedAt: new Date(),
      },
      include: this.include(),
    });

    if (rec.requestedById) {
      await this.notifications.create(
        rec.requestedById,
        'ESIGN',
        `Document sealed · ${rec.matter.diaryNo}`,
        `RSA-SHA256 seal applied. Cert ${rec.certId}`,
        id,
      );
    }

    await this.audit.record({
      actorId: signerId,
      action: 'ESIGN_SIGN',
      entityType: 'EsignRecord',
      entityId: id,
      summary: `Signed ${rec.matter.diaryNo} (local PKI · ${rec.certId})`,
    });
    return updated;
  }

  async decline(id: string, signerId: string, reason: string) {
    const rec = await this.prisma.esignRecord.findUnique({
      where: { id },
      include: { matter: true },
    });
    if (!rec) throw new NotFoundException();
    if (rec.signerId !== signerId) throw new ForbiddenException('Not the designated signer');
    if (rec.status !== EsignStatus.PENDING) throw new BadRequestException('Not pending');
    const declineReason = (reason || '').trim();
    if (declineReason.length < 5) {
      throw new BadRequestException('Decline reason required (min 5 characters)');
    }
    const updated = await this.prisma.esignRecord.update({
      where: { id },
      data: { status: EsignStatus.DECLINED, declineReason: declineReason.slice(0, 1000) },
      include: this.include(),
    });
    if (rec.requestedById) {
      await this.notifications.create(
        rec.requestedById,
        'ESIGN',
        `E-sign declined · ${rec.matter.diaryNo}`,
        declineReason.slice(0, 200),
        id,
      );
    }
    await this.audit.record({
      actorId: signerId,
      action: 'ESIGN_DECLINE',
      entityType: 'EsignRecord',
      entityId: id,
      summary: `Declined e-sign ${rec.matter.diaryNo}`,
    });
    return updated;
  }

  async revoke(id: string, actorId: string, reason: string) {
    const rec = await this.prisma.esignRecord.findUnique({
      where: { id },
      include: { matter: true },
    });
    if (!rec) throw new NotFoundException();
    if (rec.status !== EsignStatus.SIGNED && rec.status !== EsignStatus.PENDING) {
      throw new BadRequestException('Only pending or signed seals can be revoked');
    }
    const revokeReason = (reason || '').trim();
    if (revokeReason.length < 5) {
      throw new BadRequestException('Revoke reason required (min 5 characters)');
    }
    const updated = await this.prisma.esignRecord.update({
      where: { id },
      data: {
        status: EsignStatus.REVOKED,
        revokeReason: revokeReason.slice(0, 1000),
      },
      include: this.include(),
    });
    await this.audit.record({
      actorId,
      action: 'ESIGN_REVOKE',
      entityType: 'EsignRecord',
      entityId: id,
      summary: `Revoked ${rec.certId || id}: ${revokeReason.slice(0, 80)}`,
    });
    return updated;
  }
}
