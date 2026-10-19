import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { Classification, EsignStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { canSeeAllMatters } from '../auth/access';

/** Local PKI e-sign for on-prem; DocuSign hook when ESIGN_PROVIDER=docusign. */
@Injectable()
export class EsignService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

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

  async list(user: { id: string; role: Role }, matterId?: string) {
    if (matterId) {
      await this.assertMatterForUser(matterId, user);
      return this.prisma.esignRecord.findMany({
        where: { matterId },
        orderBy: { createdAt: 'desc' },
        include: {
          matter: { select: { id: true, diaryNo: true, subject: true, priority: true, status: true } },
          signer: { select: { id: true, displayName: true, role: true } },
          requestedBy: { select: { displayName: true, role: true } },
        },
      });
    }
    const canSeeAll = canSeeAllMatters(user.role);
    return this.prisma.esignRecord.findMany({
      where: canSeeAll ? undefined : { OR: [{ signerId: user.id }, { requestedById: user.id }] },
      orderBy: { createdAt: 'desc' },
      include: {
        matter: { select: { id: true, diaryNo: true, subject: true, priority: true, status: true } },
        signer: { select: { id: true, displayName: true, role: true } },
        requestedBy: { select: { displayName: true, role: true } },
      },
    });
  }

  private nextCertId() {
    const year = new Date().getFullYear();
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PK-NA-CERT-${year}-${n}`;
  }

  async verify(certId: string) {
    const id = (certId || '').trim();
    if (!id) throw new BadRequestException('Enter a certificate ID');
    const rec = await this.prisma.esignRecord.findFirst({
      where: { certId: { equals: id, mode: 'insensitive' } },
      include: {
        matter: { select: { diaryNo: true, subject: true } },
        signer: { select: { displayName: true, role: true } },
      },
    });
    if (!rec) {
      throw new NotFoundException(
        `Certificate not found: ${id}. Copy an ID from the ledger above (not the placeholder example).`,
      );
    }
    if (rec.status !== EsignStatus.SIGNED || !rec.signature) {
      return {
        valid: false,
        certId: rec.certId,
        status: rec.status,
        reason: 'Certificate is not in a signed state',
        record: rec,
      };
    }
    try {
      const parsed = JSON.parse(rec.signature) as {
        digest?: string;
        payload?: string;
        signature?: string;
        publicKey?: string;
      };
      const expected = createHash('sha256').update(parsed.payload || '').digest('hex');
      const valid = !!parsed.digest && parsed.digest === expected;
      return {
        valid,
        certId: rec.certId,
        status: rec.status,
        digest: parsed.digest,
        signedAt: rec.signedAt,
        signer: rec.signer,
        matter: rec.matter,
        reason: valid ? 'SHA-256 seal matches signed payload' : 'Digest mismatch — seal integrity failed',
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

  async request(matterId: string, signerId: string, actor: { id: string; role: Role }) {
    const matter = await this.assertMatterForUser(matterId, actor);
    const provider = process.env.ESIGN_PROVIDER || 'local_pki';
    if (provider === 'none') throw new BadRequestException('E-sign disabled');

    if (provider === 'docusign') {
      if (!process.env.DOCUSIGN_INTEGRATION_KEY) {
        throw new BadRequestException('DocuSign credentials not configured');
      }
    }

    const rec = await this.prisma.esignRecord.create({
      data: {
        matterId,
        signerId,
        requestedById: actor.id,
        provider,
        certId: this.nextCertId(),
        status: EsignStatus.PENDING,
      },
    });
    await this.prisma.matter.update({
      where: { id: matterId },
      data: { sentForEsign: true },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'ESIGN_REQUEST',
      entityType: 'EsignRecord',
      entityId: rec.id,
      summary: `E-sign requested for ${matter.diaryNo}`,
    });
    return rec;
  }

  async sign(id: string, signerId: string) {
    const rec = await this.prisma.esignRecord.findUnique({
      where: { id },
      include: { matter: true },
    });
    if (!rec) throw new NotFoundException();
    if (rec.signerId !== signerId) throw new BadRequestException('Not the designated signer');
    if (rec.status !== EsignStatus.PENDING) throw new BadRequestException('Not pending');

    const payload = JSON.stringify({
      matterId: rec.matterId,
      diaryNo: rec.matter.diaryNo,
      subject: rec.matter.subject,
      decisionText: rec.matter.decisionText,
      signerId,
      certId: rec.certId,
      ts: new Date().toISOString(),
    });

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signer = createSign('SHA256');
    signer.update(payload);
    signer.end();
    const signature = signer.sign(privateKey, 'base64');
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const digest = createHash('sha256').update(payload).digest('hex');

    const updated = await this.prisma.esignRecord.update({
      where: { id },
      data: {
        status: EsignStatus.SIGNED,
        signature: JSON.stringify({ signature, publicKey: pubPem, digest, payload }),
        signedAt: new Date(),
      },
    });
    await this.audit.record({
      actorId: signerId,
      action: 'ESIGN_SIGN',
      entityType: 'EsignRecord',
      entityId: id,
      summary: `Signed ${rec.matter.diaryNo} (local PKI)`,
    });
    return updated;
  }

  async revoke(id: string, actorId: string) {
    const updated = await this.prisma.esignRecord.update({
      where: { id },
      data: { status: EsignStatus.REVOKED },
    });
    await this.audit.record({
      actorId,
      action: 'ESIGN_REVOKE',
      entityType: 'EsignRecord',
      entityId: id,
      summary: 'E-sign record revoked',
    });
    return updated;
  }
}
