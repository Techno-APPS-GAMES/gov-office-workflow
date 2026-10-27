# Press releases & media — research & module completion

**Module:** Press releases & media monitoring (`/press`)  
**Consultation:** TECHNICAL MARKET CONSULTATION_Updated.docx §3.5  
- *press release, media and approved social-media review support*  
- Human review before AI becomes official communication (§4)

## R&D summary

| Requirement | Pilot implementation |
|-------------|----------------------|
| Bilingual press | EN/UR title + body |
| Authorization | DRAFT → SUBMITTED → APPROVED → DISPATCHED (+ REJECTED) |
| PID wire | Sequential `PR-YYYY-NNN`, draft/live PID refs |
| Social review | `socialTargets` + `socialApproved` on authorize |
| Source traceability | Optional `matterId` + `sourcesNote` |
| Embargo | `embargoUntil` blocks early dispatch |
| AI assist | Flag + human review gate before submit |
| Media monitoring | Real `MediaClip` records (not demo stubs) |
| Daily digest | Dispatched list + clippings summary |

**Out of scope:** Live wire APIs, automated social posting, paid media monitoring tools.

## How to test

1. Issue bilingual release (Urdu required for submit); optional matter + embargo.  
2. AI assist → mark human review → **Submit**.  
3. Speaker **Authorize for PID + social** → **Dispatch**.  
4. Media tab → **Log clipping** linked to release.  
5. **Daily media digest** shows dispatched items.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/press` | List |
| GET | `/press/clips` | Monitoring feed |
| GET | `/press/digest` | Dispatched digest |
| POST | `/press` | Create draft |
| PATCH | `/press/:id` | Update / human review / social |
| PATCH | `/press/:id/status` | Workflow |
| POST | `/press/clips` | Log media pickup |
