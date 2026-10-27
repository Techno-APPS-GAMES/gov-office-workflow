# Greeting cards & felicitations — research & module completion

**Module:** Parliamentary greeting cards (`/greetings`)  
**Consultation:** TECHNICAL MARKET CONSULTATION_Updated.docx §3.5  
- *official correspondence and protocol communications*  
- Link protocol work to relevant file / subject where useful  
- Human review before AI becomes official communication (§4)

## R&D summary

| Requirement | Pilot implementation |
|-------------|----------------------|
| Protocol felicitations | Occasion calendar + bilingual EN/UR cards |
| Authorization | DRAFT → SUBMITTED → APPROVED → DISPATCHED (+ REJECTED) |
| Dispatch channels | PROTOCOL_ECARD / PRINT / BOTH |
| Source link | Optional `matterId` + `sourcesNote` |
| AI assist | Flag + human-review gate before submit |
| Codes | Sequential `GC-YYYY-NNN` and `NA/SPK/GREET/YYYY/NNN` |
| Recipient planning | Categories + dignitary counts |

**Out of scope:** Mass-mail SMTP, print-shop integration, full CRM dignitary DB sync.

## How to test

1. Protocol calendar → **Issue** an occasion (or custom card).  
2. Add Urdu text; optional matter link.  
3. AI assist → mark human review → **Submit**.  
4. Speaker **Authorize** → **Dispatch**.  
5. Reject path returns card with reason.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/greetings?status=` | List |
| POST | `/greetings` | Create draft |
| PATCH | `/greetings/:id` | Update / human review |
| PATCH | `/greetings/:id/status` | Workflow |
