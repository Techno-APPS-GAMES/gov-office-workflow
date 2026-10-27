# Sprint 1 backlog — Pilot-credible files

**Goal:** Make Path A / Path B / Option B feel like a real pilot workflow, not a slideware demo.  
**Length:** ~2 weeks (adjust to team size).  
**Out of scope:** Multi-step route templates, SSO, Urdu search depth, VAPT (Sprint 2–4).

**Acceptance bar for sprint exit**

- [ ] Gate 1 F1–F10 still pass
- [ ] Gate 2 D1–D5 pass with **required due date** + **evidence attachment**
- [ ] Return-with-remarks works end-to-end
- [ ] Noting uses immutable numbered paras (no silent edit)
- [x] Pilot env: MFA enforced, no `MFA_SKIP_LOGIN_TOTP` *(S1-05 done)*
- [x] Due dates on route + required on Direction *(S1-03 done)*
- [x] Return-with-remarks works end-to-end *(S1-01 done)*
- [x] Noting uses immutable numbered paras *(S1-02 done)*
- [x] Direction evidence text + file *(S1-04 done)*
- [x] Direction events on matter Journey *(S1-08 done)*
- [x] Close matter from UI with open-direction guard *(S1-09 done)*
- [x] Related matters: search-and-link (no UUID paste) *(S1-06 done)*
- [x] Versions UI *(S1-07 done)*
- [x] Guide + runbook update for pilot *(S1-11 done)*
- [x] Automated smoke tests Path A / B / Option B *(S1-10 done)*

---

## Ticket index

| ID | Title | Priority | Effort | Status |
|----|--------|----------|--------|--------|
| S1-01 | Return file with remarks | P0 | M | **Done** |
| S1-02 | Noting sheet — immutable numbered paras | P0 | M | **Done** |
| S1-03 | Due dates on route + direction (UI + validation) | P0 | S | **Done** |
| S1-04 | Direction evidence = text + attachment | P0 | M | **Done** |
| S1-05 | Pilot env hardening (MFA, seeds, flags) | P0 | S | **Done** |
| S1-06 | Related matters — search & link | P1 | S | **Done** |
| S1-07 | Version history UI (API already exists) | P1 | S | **Done** |
| S1-08 | Direction event on matter Journey | P1 | S | **Done** |
| S1-09 | Close matter from UI | P1 | S | **Done** |
| S1-10 | Smoke tests Path A / B / Option B | P0 | M | **Done** |
| S1-11 | Guide + runbook update for pilot | P1 | S | **Done** |

---

## S1-01 — Return file with remarks

**Problem:** Files only move forward (route → ack → complete). Real offices send files back with remarks.

**API**

- New: `POST /files/:id/return`
- Body: `{ remarks: string, toUserId?: string }`
  - Default `toUserId` = previous `RouteStep.fromUserId` or `createdById`
- Rules:
  - Caller must be current `holderId` (or ADMIN)
  - Matter not `CLOSED`
  - Create `RouteStep` with `procedure: "RETURN"`, `status: "AWAITING_RECEIPT"` (or complete handoff in one step if returning to previous holder who already held it — prefer same ack pattern for consistency)
  - Journey: `RETURNED` + remarks summary
  - Audit: `MATTER_RETURN`
  - Notify recipient

**Files to touch**

- `apps/api/src/files/files.service.ts`
- `apps/api/src/files/files.controller.ts`
- `apps/web/src/app/(app)/files/[id]/page.tsx` — Overview actions
- `apps/web/src/app/(app)/movement/page.tsx` — optional Return button when holder

**UI copy**

- Button: **Return with remarks**
- Required textarea: remarks (min 10 chars)

**Test**

1. Speaker routes to Sec Gen → Sec Gen acks → Sec Gen **Return** to Speaker with remarks  
2. Speaker sees AWAITING_RECEIPT / acks → holder Speaker  
3. Journey shows RETURNED  

---

## S1-02 — Noting sheet (immutable numbered paras)

**Problem:** Notes are a flat list; real noting is numbered, append-only.

**API / data**

- Keep `MatterNote` (`number`, `text`, `authorId`) — already numbered in `addNote`
- **Do not** add update/delete endpoints
- Enhance create:
  - Optional `kind`: `NOTE` | `PUT_UP` | `OBSERVATION` (string field or reuse prefix in text)
  - Journey event `NOTE` on add
  - Audit `MATTER_NOTE`
- Optional schema: `MatterNote.kind String @default("NOTE")` — migration if you add kind

**UI** (`files/[id]` Notes tab)

- Title: **Noting sheet**
- Render as `#1`, `#2`, … with author, role, timestamp
- Label: notes cannot be edited after save
- Add form: textarea + optional kind select
- Hide any future edit affordance

**Test**

1. Add three notes as different users (after vault unlock if confidential)  
2. Confirm numbers 1–3, no edit/delete  
3. Journey lists NOTE events  

---

## S1-03 — Due dates on route + direction

**Problem:** API already accepts `dueDate` on route and decide; UI mostly omits it. Reminders in `directions.service.ts` never fire usefully without a due date.

**API**

- `POST /files/:id/route` — keep `dueDate`; validate ISO date; reject past dates for pilot
- `POST /files/:id/decide` when `decisionType === "DIRECTION"`:
  - **Require** `directionTitle`, `ownerUserId`, **`dueDate`**
  - Return `400` if missing

**UI**

- `files/[id]/page.tsx` Route form: date input **Due date**
- Decision form: when Type = Direction, show required **Due date**
- `directions/page.tsx`: show overdue styling (already partially there); ensure empty due shows **No due date** only for legacy rows

**Files**

- `apps/api/src/files/files.controller.ts` — DecisionDto tighten
- `apps/api/src/files/files.service.ts` — `decide()` validation
- `apps/web/src/app/(app)/files/[id]/page.tsx`
- Existing reminder loop: `apps/api/src/directions/directions.service.ts` (`sendDueReminders`) — no change if due dates are set

**Test**

1. Issue Direction with due = tomorrow → within 24h window, owner gets in-app notification (or force-call reminder after shortening window in test)  
2. Past due → status OVERDUE via `markOverdue`  

---

## S1-04 — Direction evidence = text + attachment

**Problem:** Evidence is a string only (`Direction.evidence`). Real completion needs a sealed file.

**Data**

- Add model or fields, e.g.:

```prisma
model DirectionEvidenceFile {
  id          String   @id @default(uuid())
  directionId String
  direction   Direction @relation(...)
  fileName    String
  contentType String
  sizeBytes   Int
  storageKey  String
  sha256      String
  createdAt   DateTime @default(now())
}
```

- Or reuse `Attachment`-like storage via `StorageService`

**API**

- `POST /directions/:id/evidence` — multipart or two-step:
  - `evidence` text (required)
  - `file` optional in Sprint 1 **required for pilot policy** (recommend required)
- `GET /directions/:id/evidence-file/download`
- Keep status → `EVIDENCE_SUBMITTED`
- Audit: include filename in summary

**UI** (`directions/page.tsx`)

- Evidence form: textarea + file input
- After submit: show text + download link
- Speaker **Review evidence** sees both

**Files**

- `apps/api/prisma/schema.prisma` + migration
- `apps/api/src/directions/directions.service.ts`
- `apps/api/src/directions/directions.controller.ts`
- `apps/api/src/storage/storage.service.ts` (reuse)
- `apps/web/src/app/(app)/directions/page.tsx`

**Test**

1. Spec Sec submits evidence text + PDF  
2. Speaker downloads PDF, then Review evidence → CLOSED  

---

## S1-05 — Pilot env hardening

**Problem:** Demo convenience flags undermine Gate 0.

**Config**

| Setting | Demo (`.env`) | Pilot (`.env.pilot` or docs) |
|---------|----------------|------------------------------|
| `MFA_REQUIRED` | true | true |
| `MFA_SKIP_LOGIN_TOTP` | true | **false** / unset |
| Seed password | `123456` | strong one-time; force change on first login |
| `VAULT_UNLOCK_TTL_MINUTES` | 30 | 15–30 (document) |

**Work**

- Add `deploy/.env.pilot.example` (no secrets) documenting required flags
- Seed: if `NODE_ENV=production` or `PILOT_MODE=true`, refuse weak default password unless `ALLOW_WEAK_SEED=true`
- Auth: when `MFA_SKIP_LOGIN_TOTP` is not exactly `true`, enforce TOTP (`auth.service.ts`)
- Update `README.md` — clarify demo vs pilot passwords (seed currently `123456`; README may still say otherwise)

**Files**

- `apps/api/src/auth/auth.service.ts`
- `apps/api/prisma/seed.ts`
- `apps/api/.env` / `deploy/`
- `docs/RUNBOOK.md` — pilot login / MFA enrollment steps
- `docs/SECURITY.md` — note skip flag is demo-only

**Test**

1. With skip false, login without TOTP fails after enrollment required  
2. Weak seed blocked in pilot mode  

---

## S1-06 — Related matters — search & link

**Problem:** UI asks for raw UUID (`files/[id]` Related tab).

**API**

- Reuse `GET /search?q=` (`apps/api/src/search/search.controller.ts`) filtered to matters  
- Or lightweight: `GET /files?q=diaryOrSubject` — prefer search service to avoid list bloat  
- Keep `POST /files/:id/related` `{ relatedId }`

**UI**

- Typeahead: search diary/subject → select → Link  
- Show linked `diaryNo — subject` (already partially shown)  
- Remove UUID placeholder

**Files**

- `apps/web/src/app/(app)/files/[id]/page.tsx`
- Optionally thin wrapper endpoint if search payload is noisy

**Test**

1. Link two INTERNAL matters by searching diary prefix  
2. Confidential target only linkable if vault-unlocked / visible  

---

## S1-07 — Version history UI

**Problem:** `POST /files/:id/versions` and `versions` on GET exist; UI does not expose them.

**UI** (`files/[id]`)

- New tab **Versions** or section under Overview  
- List: kind, reason, author, time, hash (short)  
- Form: text + reason → `POST /files/:id/versions`  
- Read-only display of prior versions (no edit in place)

**Files**

- `apps/web/src/app/(app)/files/[id]/page.tsx`
- Service already: `files.service.ts` `addVersion`

**Test**

1. Add working version with reason  
2. Matter `body` updates; ORIGINAL remains in list  

---

## S1-08 — Direction event on matter Journey

**Problem:** Direction life cycle is on `/directions` audit only; matter Journey stops at DECISION.

**API**

- In `files.service.ts` `decide()` when direction created → already `DECISION` journey  
- In `directions.service.ts` on `start` / `evidence` / `verify` / `return` / `escalate`:  
  if `matterId` set, `journeyEvent.create` e.g. `DIRECTION_START`, `DIRECTION_EVIDENCE`, `DIRECTION_CLOSED`

**UI**

- No change required if Journey tab already lists `journeyEvents`

**Test**

1. Option B full path  
2. Matter Journey shows DECISION + direction follow-on events  

---

## S1-09 — Close matter from UI

**Problem:** `POST /files/:id/close` exists (Speaker/Admin); no button on matter page. Only NFA decision closes today.

**UI**

- Speaker/Admin: **Close matter** with optional outcome text  
- Confirm dialog  
- Disabled if open directions not CLOSED (pilot rule — recommend enforce in API)

**API**

- Optionally reject close if `directions` on matter have status not in `CLOSED`  
- Journey `CLOSED` already in `close()`

**Files**

- `files/[id]/page.tsx`
- `files.service.ts` `close()` guard

**Test**

1. After Option B direction CLOSED → Close matter → status CLOSED  
2. Open direction blocks close with clear error  

---

## S1-10 — Smoke tests Path A / B / Option B

**Problem:** No `*.spec` / e2e under `apps/` today.

**Deliverable**

- API integration tests (Jest/Supertest) or a script `apps/api/test/smoke-files.e2e.ts`:

1. Login speaker → register INTERNAL → route → secgen ack → complete → speaker decide APPROVE  
2. Login speaker → register CONFIDENTIAL + password → lock → unlock → attach → route → secgen unlock → ack → complete → decide DIRECTION with dueDate → specsec start → evidence (+ file) → speaker verify  
3. Assert journey kinds and direction status CLOSED  

**CI**

- `npm run test:smoke -w @gow/api` documented in README  
- Runs against docker-compose Postgres (or testcontainer if feasible)

**Files**

- New: `apps/api/test/...`
- `apps/api/package.json` script

---

## S1-11 — Guide + runbook (pilot)

**Problem:** In-app Guide is 5 bullets; RUNBOOK may not match Sprint 1 behaviour.

**Update**

- `apps/web/src/app/(app)/guide/page.tsx` — Path A, Path B, Option B, Return, noting rules  
- `docs/RUNBOOK.md` — pilot MFA, vault password handoff note, due dates, evidence file  
- Link checklist: Gate 0–2 from consultation (short table)

---

## Dependency graph

```
S1-05 (env) ─────────────────────────────┐
S1-03 (due dates) ──┬─► S1-04 (evidence file) ─┬─► S1-10 (smoke)
S1-01 (return) ─────┤                         │
S1-02 (noting) ─────┤                         │
S1-06 (related) ────┤                         │
S1-07 (versions) ───┤                         │
S1-08 (journey) ────┴─► S1-09 (close guard) ──┘
                                      └─► S1-11 (docs)
```

Suggested order: **S1-05 → S1-03 → S1-01 → S1-02 → S1-04 → S1-08 → S1-09 → S1-06 → S1-07 → S1-10 → S1-11**

---

## Definition of done (each ticket)

- [ ] API behaviour documented in ticket test steps  
- [ ] UI uses real labels staff can understand (no UUID paste, no missing due date)  
- [ ] Audit and/or Journey updated where custody or direction changes  
- [ ] Confidential path still requires vault unlock  
- [ ] No new demo-only bypass flags  

---

## Explicit non-goals (Sprint 1)

- Per-user vault grants / password handoff protocol (Sprint 2)  
- Multi-desk route templates (Sprint 3)  
- SSO / LDAP production binding (Sprint 3)  
- Full export ZIP of binaries (export metadata exists at `GET /export`; binary pack later)  
- VAPT / SIEM (Sprint 4)  
