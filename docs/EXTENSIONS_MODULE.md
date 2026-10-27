# Work records / extensions hub — research & module completion

**Module:** Work register hub (`/extensions`)  
**Consultation:** TECHNICAL MARKET CONSULTATION_Updated.docx §3.5 expansion surface + NA ops research (questions/Hansard as later systems)

## R&D summary

| Requirement | Pilot implementation |
|-------------|----------------------|
| Single register for office work | `WorkItem` CRUD + workflow on `/extensions` |
| Aggregate sibling modules | Speeches, press, greetings, calls listed with filters |
| Deep links | `?focus=` into module pages / matter file; inbox uses `/extensions?focus=` |
| Authorization | DRAFT → SUBMITTED → APPROVED / REJECTED (+ Speaker direct approve) |
| Matter link | Optional `matterId`, classification, priority, due date |
| Codes | Sequential `WR-YYYY-NNN` |
| Legislative / Hansard / questions | Tier C scaffold cards + LEGISLATIVE / QUESTION / HANSARD note kinds |

**Out of scope:** Live questions DB, Hansard production, bill-track AI (Tier C).

## How to test

1. Open `/extensions` → **New work record** → save draft (`WR-…`).  
2. **Submit for approval** → Speaker/Sec Gen/Admin sees inbox + KPI “awaiting”.  
3. Open detail → **Approve** or **Reject** (reason ≥5 chars).  
4. Filter **Briefs & speeches** / **Media** / **Correspondence** — sibling rows show **Open module** deep links.  
5. **Legislative record** shows Tier C scaffolds (or your LEGISLATIVE notes).

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/work-items?status=&kind=` | List (role-scoped) |
| GET | `/work-items/:id` | Detail |
| POST | `/work-items` | Create draft |
| PATCH | `/work-items/:id` | Edit draft/rejected |
| POST | `/work-items/:id/submit` | Submit |
| POST | `/work-items/:id/decide` | `{ approve, reason?, note? }` |
