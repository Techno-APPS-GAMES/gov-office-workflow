import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Client } from 'ldapts';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LdapService {
  private readonly log = new Logger(LdapService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  status() {
    return {
      enabled: process.env.LDAP_ENABLED === 'true',
      url: process.env.LDAP_URL || null,
      searchBase: process.env.LDAP_SEARCH_BASE || null,
    };
  }

  async sync(actorId: string) {
    if (process.env.LDAP_ENABLED !== 'true') {
      throw new BadRequestException('LDAP sync disabled — set LDAP_ENABLED=true');
    }
    const url = process.env.LDAP_URL;
    const bindDn = process.env.LDAP_BIND_DN;
    const bindPassword = process.env.LDAP_BIND_PASSWORD;
    const searchBase = process.env.LDAP_SEARCH_BASE;
    if (!url || !bindDn || !bindPassword || !searchBase) {
      throw new BadRequestException('LDAP configuration incomplete');
    }

    const client = new Client({ url });
    let imported = 0;
    try {
      await client.bind(bindDn, bindPassword);
      const { searchEntries } = await client.search(searchBase, {
        scope: 'sub',
        filter: '(objectClass=person)',
        attributes: ['dn', 'cn', 'mail', 'sAMAccountName', 'uid'],
      });

      for (const entry of searchEntries) {
        const username =
          String(entry.sAMAccountName || entry.uid || '').trim() ||
          String(entry.dn).split(',')[0]?.replace(/^cn=/i, '') ||
          '';
        const email = String(entry.mail || `${username}@ldap.local`);
        const displayName = String(entry.cn || username);
        if (!username) continue;

        const existing = await this.prisma.user.findFirst({
          where: { OR: [{ username }, { ldapDn: String(entry.dn) }] },
        });
        if (existing) {
          await this.prisma.user.update({
            where: { id: existing.id },
            data: { displayName, email, ldapDn: String(entry.dn) },
          });
        } else {
          const tempPass = await this.crypto.hashPassword(
            `LdapTemp!${Math.random().toString(36).slice(2)}9A`,
          );
          await this.prisma.user.create({
            data: {
              username,
              displayName,
              email,
              passwordHash: tempPass,
              role: Role.SPECIAL_SECRETARY,
              ldapDn: String(entry.dn),
              mfaEnabled: false,
              active: true,
            },
          });
          imported++;
        }
      }
    } finally {
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
    }

    await this.audit.record({
      actorId,
      action: 'LDAP_SYNC',
      entityType: 'System',
      entityId: null,
      summary: `LDAP sync complete; ${imported} new users`,
    });
    this.log.log(`LDAP sync imported ${imported}`);
    return { ok: true, imported };
  }
}
