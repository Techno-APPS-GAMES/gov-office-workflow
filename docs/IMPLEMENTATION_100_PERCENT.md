# Implementation plan — 100% coverage

**Goal:** Close every gap vs (1) `Techicical` consultation and (2) research requirements in `NA_OPERATIONS_RESEARCH_AND_REQUIREMENTS.md`.

**Honest scope split**

| Tier | Meaning | Target |
|------|---------|--------|
| **A — Pilot 100%** | Tech §3.1–3.4 + §6 demo + §4/§7 security *minimum for pilot* | **Complete** |
| **B — Production 100%** | VAPT, SSO live, SIEM, full e-sign PKI, binary export exit, training pack | Follow-on |
| **C — Expansion 100%** | Tech §3.5 (questions, Hansard, media AI, etc.) | Separate epics |

Claiming “100% of everything including Hansard + live VAPT” in one sprint is not credible. **Tier A = consultation-ready Speaker’s Office pilot.** Tiers B–C remain listed so nothing is forgotten.

---

## Status legend

| Status | Meaning |
|--------|---------|
| DONE | Implemented and usable |
| IN PROGRESS | Being built in current workstream |
| TODO | Not yet done |
| PARTIAL | Exists but below acceptance |

---

## Tier A — Pilot 100% (Tech §3.1–3.4 + demo §6)

### A1. Document & file management (Tech 3.1)

| ID | Item | Status |
|----|------|--------|
| A1.01 | Register incoming matter + metadata | DONE |
| A1.02 | Attachments + hash + vault encrypt | DONE |
| A1.03 | Classification Public/Internal/Confidential | DONE |
| A1.04 | Version history UI + API | DONE |
| A1.05 | Full-text / permission-aware search | DONE |
| A1.06 | Route / ack / complete / return | DONE |
| A1.07 | Noting sheet append-only | DONE |
| A1.08 | Related matters search-link | DONE |
| A1.09 | Journey + status / holder view | DONE |
| A1.10 | **R&I Receive register** (diary stamp: from/by/date/time/channel) | DONE |
| A1.11 | **R&I Despatch register** (outward ref, method, recipient) | DONE |
| A1.12 | **Speaker put-up checklist** (body, attachment or note, classification OK) | DONE |
| A1.13 | **Multi-step route templates** | DONE |
| A1.14 | OCR on attachments | DONE (auto on attach + manual re-run) |
| A1.15 | Auto metadata + **human-reviewed summary** (EN/UR) on register | DONE |

### A2. Decisions & directions (Tech 3.2)

| ID | Item | Status |
|----|------|--------|
| A2.01 | Structured decisions | DONE |
| A2.02 | Direction linked to matter | DONE |
| A2.03 | Owner + due date required | DONE |
| A2.04 | Reminders (in-app) | DONE |
| A2.05 | Escalation | DONE |
| A2.06 | Evidence text + file + verify | DONE |
| A2.07 | Directions dashboard KPIs | DONE |
| A2.08 | Direction events on matter journey | DONE |

### A3. Meetings & visitors (Tech 3.3)

| ID | Item | Status |
|----|------|--------|
| A3.01 | Meeting create + brief | DONE |
| A3.02 | Conflict detect + alternatives (API) | DONE |
| A3.03 | **UI: show conflicts + alternatives before force-book** | DONE |
| A3.04 | Meeting actions → create Direction | DONE |
| A3.05 | Visitor/delegation categories + screening fields | DONE |
| A3.06 | Searchable meeting history | DONE |

### A4. Schedule (Tech 3.4)

| ID | Item | Status |
|----|------|--------|
| A4.01 | Diary items CRUD | DONE |
| A4.02 | Conflict detect + alternatives (API) | DONE |
| A4.03 | **UI: conflict banner + suggested slots** | DONE |
| A4.04 | Change notifications on schedule edit | DONE |
| A4.05 | Role-based schedule visibility | DONE |

### A5. Demo scenario (Tech §6)

| ID | Item | Status |
|----|------|--------|
| A5.01 | Register + attach | DONE |
| A5.02 | Classify + **summary EN/UR with Accept** | DONE |
| A5.03 | Route | DONE |
| A5.04 | Decision/direction linked | DONE |
| A5.05 | Direction due + reminder | DONE |
| A5.06 | Directions dashboard | DONE |
| A5.07 | Search retrieve + permissions | DONE |
| A5.08 | Meeting + conflict alternatives | DONE |
| A5.09 | Notes/actions → direction | DONE |
| A5.10 | Full audit trail | DONE |

### A6. Principles & security (Tech §4 / §7) — pilot bar

| ID | Item | Status |
|----|------|--------|
| A6.01 | MFA + pilot flags (no skip in PILOT_MODE) | DONE |
| A6.02 | Vault encrypt + TTL grants | DONE |
| A6.03 | Audit ledger verify | DONE |
| A6.04 | Export metadata pack | DONE |
| A6.05 | **Urdu + English core UI** (files, directions, vault, guide, registry) | DONE |
| A6.06 | Human review gate for AI summary | DONE |
| A6.07 | No external AI training of NA data (config/docs) | DONE |
| A6.08 | On-prem Docker compose path | DONE |
| A6.09 | Smoke tests Path A/B/Option B + Tier A extras | DONE |
| A6.10 | Download watermark reason (Confidential) | DONE |

---

## Tier B — Production 100%

| ID | Item | Status |
|----|------|--------|
| B.01 | Live SSO / AD (LDAP beyond stub) | TODO |
| B.02 | Advanced e-sign / PKI accredited | TODO |
| B.03 | Full binary export ZIP exit | TODO |
| B.04 | VAPT + remediations | TODO |
| B.05 | SIEM / syslog shipping | TODO |
| B.06 | Backup/restore drill documented + automated | TODO |
| B.07 | Incident response runbook signed off | TODO |
| B.08 | Admin training + end-user training packs | TODO |
| B.09 | Per-user vault grants / clearance matrix | TODO |
| B.10 | Acting charge / out-of-office delegation | TODO |
| B.11 | Record Branch retention + weeding dual-control | TODO |
| B.12 | Email/SMS reminder connectors | TODO |

---

## Tier C — Expansion 100% (Tech §3.5)

| ID | Item | Status |
|----|------|--------|
| C.01 | Questions / parliamentary business | TODO (scaffold only) |
| C.02 | Speeches / talking points grounded drafting | PARTIAL module |
| C.03 | Protocol correspondence depth | PARTIAL letters |
| C.04 | Call logging | PARTIAL module |
| C.05 | Remote review/approval channels | PARTIAL module |
| C.06 | Press / social review | PARTIAL module |
| C.07 | Legislative search / bill track / Hansard / translation | TODO |

---

## Research extras (beyond Tech, for real NA fit)

| ID | Item | Tier | Status |
|----|------|------|--------|
| R.01 | Dak Received stamp fields (NA circular) | A | DONE |
| R.02 | Monthly arrears return export | B | TODO |
| R.03 | Classified custody receipt on every handoff | B | TODO |
| R.04 | File numbering scheme configurable | B | TODO |
| R.05 | NITB e-Office API coexistence stub | B | TODO |

---

## Acceptance: when we say “Pilot 100%”

All **Tier A** rows are DONE (no PARTIAL/TODO remaining in A1–A6).  
Smoke covers R&I, put-up, AI accept summary, route templates, schedule conflict, meeting→direction, AI training flag.

## Acceptance: “Consultation package 100%”

Tier A + Tier B + Tier C all DONE — **multi-quarter programme**.

---

## How to verify Tier A

```bash
# From gov-office-workflow/
npx prisma db push --schema apps/api/prisma/schema.prisma
npm run seed -w @gow/api
# restart API, then:
npm run smoke -w @gow/api
```

UI paths: `/registry` (R&I), `/files/[id]` (put-up, summary Accept, route templates, confidential download reason), `/meetings` (conflict + action→direction), `/schedule` (conflict + alternatives), language toggle EN/UR in shell.

---

## What “100%” means in this delivery

| Claim | Coverage |
|-------|----------|
| **Pilot / Tech demo §3.1–3.4 + §6** | **100%** (Tier A) |
| Full production hardening (§7 full VAPT/SIEM/SSO) | Tier B — not claimed |
| Expansion §3.5 Hansard etc. | Tier C — not claimed |

*Living document — update Status column as Tier B/C items land.*
