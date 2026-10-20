# Self-guided tester handoff — Government Office Workflow

**Primary guide for testers (open in browser):** [`TESTER_HANDOFF.html`](./TESTER_HANDOFF.html)

Testers **perform the work themselves**. We give logins, exact sample text to type, and step-by-step flows. They should create new records (subjects starting with `UAT-FLOW…`), not only inspect old seeded data.

---

## Access

| Item | Value |
|------|--------|
| Web | https://office-workflow-preview.walkwell.pk/login |
| Password (all accounts) | `Tester@Office1` |
| Confidential vault (Flow 2) | `VaultTest!01` |

| Username | Role |
|----------|------|
| `speaker` | Speaker |
| `secgen` | Secretary General |
| `specsec` | Special Secretary |
| `admin` | Admin (audit) |

MFA is off for UAT. You should **not** see “Enable authenticator”.

---

## Flows to complete (in order)

### Flow 1 — Full file path (~25 min)
**Roles:** speaker → secgen → speaker → specsec → speaker  

1. As **speaker**, register INTERNAL file with subject `UAT-FLOW1 Invitation to Cultural Evening — Protocol advice required` (full body in HTML guide).  
2. Add noting + Generate/Accept summary.  
3. Route to **secgen** (“Examine and advise…”).  
4. As **secgen**, Acknowledge → note → Complete procedure.  
5. As **speaker**, Decision = DIRECTION to **specsec** titled `UAT-FLOW1 Prepare one-page Cultural Evening briefing + seating plan`.  
6. As **specsec**, Start direction → submit evidence text + file.  
7. As **speaker**, Verify evidence → Close matter.

### Flow 2 — Confidential vault (~10 min)
**Role:** speaker  

Register CONFIDENTIAL matter `UAT-FLOW2…`, password `VaultTest!01`, unlock, attach, download with short reason (should fail) then proper reason (should pass).

### Flow 3 — Dak register (~8 min)
**Role:** secgen  

Stamp IN `UAT-FLOW3 Incoming dak…` then OUT `UAT-FLOW3 Outward despatch…` on **Registry**.

### Flow 4 — Meeting → direction (~12 min)
**Roles:** secgen → speaker  

Create meeting `UAT-FLOW4 Courtesy call…` → Speaker approves → add action with linked direction.

### Flow 5 — Schedule conflict (~8 min)
**Role:** speaker  

Book `UAT-FLOW5 Primary diary block…` then overlapping `UAT-FLOW5 Overlap attempt…` → confirm conflict UI / alternatives.

### Flow 6 — Search, Urdu, audit (~8 min)
**Roles:** speaker → admin  

Search `UAT-FLOW1` → toggle اردو → as **admin** check Audit for your actions.

---

## Feedback

Use **Copy my results** in the HTML (or paste):

```
Tester name:
Date:
Environment: https://office-workflow-preview.walkwell.pk/login

Step | Result (Done/Fail/Blocked) | Notes

Blockers:
UX issues:
Missing vs office practice:
Screenshots:
```

---

## For the delivery team

Reset clean pack: `npm run prepare:testers`  
Do not run `npm run smoke` on shared preview after handoff.
