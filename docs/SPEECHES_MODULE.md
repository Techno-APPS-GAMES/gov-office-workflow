# Speeches & prompter — research & module completion

**Module:** Speeches & prompter (`/speeches`)  
**Consultation:** TECHNICAL MARKET CONSULTATION_Updated.docx  
- Desired end-state: *prepare or retrieve briefs, talking points and speeches from authorized source material, with clear source traceability and human review*  
- §3.5 Expansion: *speeches, talking points, briefings and source-based drafting assistance*  
- §4 Human controlled: AI drafts must not become official without authorized human review  
- Urdu + English capable

## R&D summary

| Requirement | Pilot implementation |
|-------------|----------------------|
| Source-linked remarks | Optional `matterId` + `sourcesNote` |
| Talking points / briefs | `talkingPoints` + `talkingPointsUr` |
| Bilingual delivery | `body` + `bodyUr`; prompter EN↔UR toggle |
| AI drafting assistance | `/ai/ask` with optional matter context; `aiAssisted` flag |
| Human review before official use | Block submit if AI-assisted without `humanReviewedAt` |
| Authorization workflow | DRAFT → SUBMITTED → APPROVED / REJECTED → ARCHIVED |
| Teleprompter | Full-screen: remarks/points, font size, auto-scroll, mirror |
| Inbox | SUBMITTED speeches surface in remote review queue |

**Out of scope (later):** Teleprompter hardware integration, voice sync, Hansard export.

## How to test

1. Prepare speech linked to a matter; add talking points.  
2. Run **AI assist** → banner requires **Mark human review complete**.  
3. **Submit for authorization** → Speaker/SecGen inbox notice.  
4. **Authorize** → **Open Speaker prompter** (scroll, A+/A−, mirror, EN/UR).  
5. Reject path: SUBMITTED → Reject with reason → author notified.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/speeches?status=` | List |
| POST | `/speeches` | Create draft |
| PATCH | `/speeches/:id` | Update + `markHumanReviewed` |
| PATCH | `/speeches/:id/status` | `{ status, reason? }` |
