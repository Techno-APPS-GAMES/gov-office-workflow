# Remote e-sign — research & module completion

**Module:** Remote work & digital E-sign (`/remote`)  
**Consultation:** TECHNICAL MARKET CONSULTATION_Updated.docx §3.5 — *secure remote review and approval through official channels*  
**Research:** `NA_OPERATIONS_RESEARCH_AND_REQUIREMENTS.md` R-SIG-01…03 · Pakistan ETO 2002 · ECAC

## R&D summary

| Source | Requirement | Pilot implementation |
|--------|-------------|----------------------|
| Consultation §3.5 | Secure remote review/approval via official channels | Request → inbox notice → review payload → seal on `/remote` |
| Consultation §4 | Secure by design, audit, least privilege | Vault gate for confidential; RBAC; hash-chained audit |
| R-SIG-01 | ETO-compatible electronic / advanced signature | **LOCAL_PKI**: RSA-SHA256 under signer sole control; change-detectable via document hash |
| R-SIG-02 | Preserve certificate metadata + document hash | `certId`, `documentHash`, `algorithm`, public key + signature blob |
| R-SIG-03 | Wet-ink scan for excluded types | **WET_INK** method with mandatory note |
| ETO / ECAC | Accredited CSP for full legal presumption | **Tier B** — connector hook `ESIGN_PROVIDER=docusign` (or future ECAC CSP); not claimed as accredited |

**Honest boundary:** Pilot seals are **on-prem advanced-style** (unique, sole control, tamper-evident). They are **not** ECAC-accredited certificates. Production legal sign-off should plug an accredited CSP.

## What was completed

- Sequential cert IDs `PK-NA-CERT-YYYY-NNNN`
- Purpose + method on request (Speaker / SecGen / SpecSec / Admin)
- Preview before sign + confirm hash guard
- Real **RSA verify** (`createVerify`) + SHA-256 document hash
- Decline (signer) / Revoke (Speaker, Admin, DG IT) with reasons
- Wet-ink path
- Inbox notification on request / sign / decline
- Matter workspace: **Request remote seal**
- Live refresh on Remote studio
- Certificate lookup + copy ID

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/esign` | List (scoped) |
| GET | `/esign/verify?certId=` | Public integrity check |
| GET | `/esign/:id/preview` | Signer preview |
| POST | `/esign/request` | `{ matterId, signerId, purpose?, method? }` |
| POST | `/esign/:id/sign` | `{ confirmHash?, wetInkNote? }` |
| POST | `/esign/:id/decline` | `{ reason }` |
| POST | `/esign/:id/revoke` | `{ reason }` |

## How to test

1. Login as SecGen → Files → open a matter → **Request remote seal** (signer = Speaker).
2. Login as Speaker → Inbox / Remote → **Review & seal** → confirm.
3. **Verify seal** in ledger (must show valid RSA + hash).
4. Optional: request WET_INK, record note ≥8 chars.
5. Revoke with reason; verify shows revoked.

## Tier B follow-on

- ECAC-accredited CSP or NITB PKI integration
- Hardware token / HSM private keys (no ephemeral keypair per seal)
- Long-term certificate lifecycle / CRL
