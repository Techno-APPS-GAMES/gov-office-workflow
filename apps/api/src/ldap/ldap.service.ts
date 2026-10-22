import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Client } from 'ldapts';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';

/**
 * LDAP / Active Directory connector.
 * Pilot default: disabled stub — local /users directory is authoritative.
 * Production (Tier B): set LDAP_ENABLED=true + URL/bind/search env vars.
 */
@Injectable()
export class LdapService {
  private readonly log = new Logger(LdapService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  status() {
    const enabled = process.env.LDAP_ENABLED === 'true';
    const url = process.env.LDAP_URL || null;
    const searchBase = process.env.LDAP_SEARCH_BASE || null;
    const bindDn = process.env.LDAP_BIND_DN || null;
    const configured = Boolean(url && searchBase && bindDn && process.env.LDAP_BIND_PASSWORD);
    return {
      mode: enabled ? (configured ? 'configured' : 'misconfigured') : 'stub',
      enabled,
      ready: enabled && configured,
      url: enabled ? url : null,
      searchBase: enabled ? searchBase : null,
      bindDnSet: Boolean(bindDn),
      message: enabled
        ? configured
          ? 'LDAP enabled — Sync directory pulls AD persons into local users.'
          : 'LDAP_ENABLED=true but URL / bind / search base incomplete.'
        : 'Pilot uses the local staff directory. Live Active Directory / SSO is Tier B — set LDAP_ENABLED=true when ready.',
      tier: 'B',
    };
  }

  async sync(actorId: string) {
    const st = this.status();
    if (!st.enabled) {
      return {
        ok: false,
        stub: true,
        imported: 0,
        message: st.message,
      };
    }
    if (!st.ready) {
      throw new BadRequestException(st.message);
    }

    const url = process.env.LDAP_URL!;
    const bindDn = process.env.LDAP_BIND_DN!;
    const bindPassword = process.env.LDAP_BIND_PASSWORD!;
    const searchBase = process.env.LDAP_SEARCH_BASE!;

    const client = new Client({ url });
    let imported = 0;
    let updated = 0;
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
          updated++;
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
      summary: `LDAP sync complete; ${imported} new, ${updated} updated`,
    });
    this.log.log(`LDAP sync imported ${imported}, updated ${updated}`);
    return { ok: true, stub: false, imported, updated, message: 'Directory sync complete' };
  }
}
