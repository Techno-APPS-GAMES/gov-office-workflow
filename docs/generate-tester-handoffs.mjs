/**
 * Detailed UAT handoff packs (no personal names).
 * Packs: 01–05 full module tour · 06 short smoke
 * Run: node docs/generate-tester-handoffs.mjs
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = 'https://office-workflow-preview.walkwell.pk';
const LOGIN = `${APP}/login`;
const PASS = 'Tester@Office1';
const VAULT = 'VaultTest!01';

const CSS = `
:root{--ink:#1a2332;--muted:#5c6b7a;--line:#d8dee6;--paper:#f7f5f1;--card:#fff;--pine:VAR_PINE;--pine-soft:#e8f2ec;--amber:#8a5a12;--amber-soft:#faf0e0;--sky:#e8eef6;--ok:#1e5c3a;--shadow:0 1px 2px rgba(26,35,50,.06),0 8px 24px rgba(26,35,50,.06);--font:"Segoe UI",system-ui,sans-serif;--mono:Consolas,monospace}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:var(--font);color:var(--ink);line-height:1.55;background:radial-gradient(ellipse 70% 40% at 0% 0%,#e4efe8,transparent 55%),var(--paper)}
a{color:var(--pine)}code{font-family:var(--mono);font-size:.86em;background:#eef2f6;padding:.1em .35em;border-radius:4px}
.wrap{max-width:940px;margin:0 auto;padding:24px 16px 100px}
.hero{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:26px;margin-bottom:14px;border-top:5px solid var(--pine)}
.eyebrow{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--pine);font-weight:700}
h1{margin:6px 0 8px;font-size:clamp(1.3rem,3vw,1.75rem)}
.tag{display:inline-block;background:var(--pine);color:#fff;font-family:var(--mono);font-size:.85rem;padding:4px 12px;border-radius:999px;margin:8px 0}
.hero p{margin:0;color:var(--muted)}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.btn{display:inline-flex;border:1px solid var(--line);background:#fff;color:var(--ink);padding:8px 14px;border-radius:999px;font-size:.88rem;text-decoration:none;cursor:pointer}
.btn.primary{background:var(--pine);border-color:var(--pine);color:#fff}
.toc{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:5px;background:rgba(247,245,241,.95);border:1px solid var(--line);border-radius:10px;padding:8px;margin-bottom:14px}
.toc a{text-decoration:none;font-size:.72rem;color:var(--muted);padding:4px 8px;border-radius:999px}
.toc a:hover{background:var(--pine-soft);color:var(--pine)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:20px;margin-bottom:14px}
.card h2{margin:0 0 6px;font-size:1.12rem}.lead{margin:0 0 12px;color:var(--muted);font-size:.93rem}
.creds{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
.cred{background:var(--pine-soft);border:1px solid #c5d9cc;border-radius:10px;padding:10px}
.cred.vault{background:var(--amber-soft);border-color:#e6d2a8}
.cred .lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700}
.cred .val{font-family:var(--mono);font-size:.88rem;margin-top:3px;word-break:break-all}
.cred button,.cp{margin-top:6px;border:1px solid var(--line);background:#fff;border-radius:6px;font-size:.72rem;padding:3px 8px;cursor:pointer;color:var(--pine)}
table{width:100%;border-collapse:collapse;font-size:.88rem}th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line)}
th{font-size:.7rem;text-transform:uppercase;color:var(--muted);background:#f3f5f7}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:10px;margin-top:10px}
.mod{border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:12px;background:var(--card);box-shadow:var(--shadow)}
.mod>summary{list-style:none;cursor:pointer;padding:13px 15px;background:linear-gradient(180deg,#f8faf9,#f1f4f2);display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-weight:700}
.mod>summary::-webkit-details-marker{display:none}
.mod-num{background:var(--pine);color:#fff;min-width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem}
.mod-meta{width:100%;font-weight:500;color:var(--muted);font-size:.8rem}
.mod-body{padding:4px 12px 14px}
.step{display:grid;grid-template-columns:36px 1fr;gap:10px;padding:12px 4px;border-bottom:1px dashed var(--line)}
.step:last-child{border-bottom:none}
.step-n{width:30px;height:30px;border-radius:50%;background:var(--sky);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem}
.step h3{margin:0 0 6px;font-size:.95rem}
.who,.where{display:inline-block;font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;margin:0 6px 8px 0}
.who{background:var(--pine-soft);color:var(--pine)}.where{background:var(--sky);color:#2a4a6b}
.do{margin:0 0 8px;padding-left:18px;font-size:.9rem}.do li{margin:4px 0}
.data{background:#fafbfc;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:8px 0}
.data .row{display:grid;grid-template-columns:120px 1fr auto;gap:6px;padding:5px 0;border-bottom:1px solid #eef1f4;align-items:start}
.data .row:last-child{border-bottom:none}
.data .k{color:var(--muted);font-size:.7rem;text-transform:uppercase;font-weight:700;padding-top:2px}
.data .v{font-family:var(--mono);font-size:.82rem;white-space:pre-wrap;word-break:break-word}
.expect{background:#eef8f1;border-left:3px solid var(--ok);padding:8px 11px;border-radius:0 8px 8px 0;font-size:.86rem;margin-top:8px}
.mark{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.mark label{font-size:.82rem;border:1px solid var(--line);border-radius:999px;padding:3px 9px;cursor:pointer;background:#fafbfc}
.mark label:has(input:checked){background:var(--pine-soft);border-color:var(--pine)}
.mark textarea{width:100%;min-height:38px;margin-top:4px;border:1px solid var(--line);border-radius:8px;padding:7px;font:inherit}
.callout{border-left:4px solid var(--pine);background:var(--pine-soft);padding:11px 13px;border-radius:0 8px 8px 0;font-size:.9rem;margin-top:10px}
.callout.warn{border-left-color:var(--amber);background:var(--amber-soft)}
footer{text-align:center;color:var(--muted);font-size:.82rem;margin-top:20px}
@media(max-width:560px){.data .row{grid-template-columns:1fr}}
@media print{.toc,.actions,.btn,.cp,.mark{display:none!important}}
`.trim();

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rows(pairs) {
  return `<div class="data">${pairs
    .map(
      ([k, v]) =>
        `<div class="row"><span class="k">${esc(k)}</span><span class="v" data-v>${esc(v)}</span><button type="button" class="cp">Copy</button></div>`,
    )
    .join('')}</div>`;
}

function step(n, opts) {
  const dos = (opts.do || []).map((x) => `<li>${x}</li>`).join('');
  return `<div class="step">
  <div class="step-n">${n}</div>
  <div>
    <span class="who">${esc(opts.who)}</span>
    <span class="where">${esc(opts.where)}</span>
    <h3>${esc(opts.title)}</h3>
    ${opts.intro ? `<p style="margin:0 0 8px;font-size:.9rem">${opts.intro}</p>` : ''}
    ${dos ? `<ol class="do">${dos}</ol>` : ''}
    ${opts.data ? rows(opts.data) : ''}
    ${opts.after ? `<p style="margin:8px 0 0;font-size:.9rem">${opts.after}</p>` : ''}
    <div class="expect"><strong>Pass if:</strong> ${esc(opts.expect)}</div>
    <div class="mark" data-id="${esc(opts.id)}"></div>
  </div>
</div>`;
}

function mod(num, id, title, meta, body, open = false) {
  return `<details class="mod" id="${id}"${open ? ' open' : ''}>
  <summary><span class="mod-num">${num}</span> ${esc(title)}<span class="mod-meta">${esc(meta)}</span></summary>
  <div class="mod-body">${body}</div>
</details>`;
}

/** Five full packs + one short — themes only, no person names */
const PACKS = [
  {
    id: '01',
    tag: 'UAT-P01',
    theme: 'Cultural evening — protocol advice',
    color: '#1e4d3a',
    short: false,
    d: {
      subject: 'UAT-P01 Invitation to Cultural Evening — Protocol advice required',
      sender: 'Protocol Wing, National Assembly',
      body: 'Please examine whether the Honourable Speaker should attend the Cultural Evening on 15 November. Cover seating, security and optics, and put up a short recommendation.',
      area: 'Protocol',
      note: 'Para 1: UAT-P01 registered. Route to Secretary General for examine and advise before put-up.',
      procedure: 'Examine and advise on Cultural Evening attendance (UAT-P01)',
      ackNote: 'Examined. Attendance recommended subject to security clearance. Spec Sec should prepare one-page put-up.',
      outcome: 'Procedure complete — recommend attendance with VIP seating plan (UAT-P01).',
      decisionText: 'Approved in principle. Issue direction for briefing and seating plan (UAT-P01).',
      dirTitle: 'UAT-P01 Prepare one-page Cultural Evening briefing + seating plan',
      evidence: 'Briefing prepared: recommend attendance; VIP row A; security liaison Protocol Wing. (UAT-P01)',
      closeOut: 'UAT-P01 complete — briefing accepted; attendance confirmed.',
      confSubj: 'UAT-P01 Confidential — bilateral courtesy talking points',
      confSender: 'Ministry Desk (Confidential)',
      confBody: 'CONFIDENTIAL UAT-P01. Restricted bilateral courtesy points. Vault handling only.',
      dakInFrom: 'Ministry of Culture — Section Officer',
      dakInSubj: 'UAT-P01 Incoming dak — cultural evening invitation pack',
      dakOutTo: 'Protocol Wing — Director',
      dakOutSubj: 'UAT-P01 Outward despatch — acknowledgement of invitation',
      meetTitle: 'UAT-P01 Courtesy call — visiting Ambassador',
      meetLoc: 'Speaker Chamber',
      meetBrief: 'Official visitor. Courtesy call 30 minutes. Theme: cultural cooperation. (UAT-P01)',
      meetAction: 'UAT-P01 Circulate background brief to Special Secretary before call',
      sched1: 'UAT-P01 Primary diary block — office hours',
      sched2: 'UAT-P01 Overlap attempt — must show conflict',
      callParty: 'Director Protocol — Culture Desk',
      callSum: 'UAT-P01 Call: confirm Cultural Evening VIP list and arrival time.',
      speechTitle: 'UAT-P01 Remarks — Cultural Evening welcome',
      speechBody: 'Honourable guests, welcome to this evening of culture and friendship. Pakistan values dialogue through the arts. (UAT-P01 draft)',
      pressTitle: 'UAT-P01 Press note — Speaker to attend Cultural Evening',
      pressBody: 'The Honourable Speaker will attend the Cultural Evening on 15 November, subject to schedule. Protocol arrangements are underway. (UAT-P01)',
      greetOcc: 'UAT-P01 Cultural Evening felicitation',
      greetRec: 'Participating missions and cultural organisations',
      greetMsg: 'Warm greetings on the Cultural Evening. Best wishes for a successful programme. (UAT-P01)',
      workTitle: 'UAT-P01 Brief — seating and security checklist',
      workText: 'Checklist: VIP seating, security liaison, media pool, arrival sequence. (UAT-P01)',
      msg: 'UAT-P01: Please confirm Protocol Wing has the VIP list for Cultural Evening.',
      search: 'UAT-P01',
      esignPurpose: 'UAT-P01 Approve put-up for Speaker seal',
    },
  },
  {
    id: '02',
    tag: 'UAT-P02',
    theme: 'Mid-year budget brief — finance coordination',
    color: '#1a4a6b',
    short: false,
    d: {
      subject: 'UAT-P02 Mid-year budget brief for Speaker Office',
      sender: 'Ministry of Finance — Budget Wing',
      body: 'Examine the mid-year budget brief and advise whether a Speaker-level meeting with MoF is required this month. Highlight three risk points.',
      area: 'Finance',
      note: 'Para 1: UAT-P02 budget brief registered. Route Sec Gen for examine and advise.',
      procedure: 'Examine mid-year budget brief and advise (UAT-P02)',
      ackNote: 'Reviewed. Meeting with MoF useful. Spec Sec to draft talking points. (UAT-P02)',
      outcome: 'Procedure complete — recommend short MoF coordination meeting (UAT-P02).',
      decisionText: 'Agreed. Direction for one-page budget talking points (UAT-P02).',
      dirTitle: 'UAT-P02 Draft one-page budget talking points for MoF meeting',
      evidence: 'Talking points: deficit path, PSDP pace, salary bill — draft attached. (UAT-P02)',
      closeOut: 'UAT-P02 complete — talking points accepted.',
      confSubj: 'UAT-P02 Confidential — fiscal sensitivity note',
      confSender: 'Finance Desk (Confidential)',
      confBody: 'CONFIDENTIAL UAT-P02. Fiscal sensitivity points for restricted circulation.',
      dakInFrom: 'Ministry of Finance — Budget Wing',
      dakInSubj: 'UAT-P02 Incoming dak — mid-year budget brief',
      dakOutTo: 'Finance Desk — Joint Secretary',
      dakOutSubj: 'UAT-P02 Outward — receipt acknowledgement of budget brief',
      meetTitle: 'UAT-P02 Coordination meeting — MoF Budget Wing',
      meetLoc: 'Committee Room B',
      meetBrief: 'Mid-year fiscal path. 45 minutes. Bring PSDP snapshot. (UAT-P02)',
      meetAction: 'UAT-P02 Share PSDP snapshot with Special Secretary before meeting',
      sched1: 'UAT-P02 Diary — MoF prep block',
      sched2: 'UAT-P02 Overlap attempt — conflict check',
      callParty: 'JS Budget — Ministry of Finance',
      callSum: 'UAT-P02 Call: confirm MoF meeting slot and attendees.',
      speechTitle: 'UAT-P02 Opening remarks — fiscal coordination huddle',
      speechBody: 'Colleagues, today we align on mid-year fiscal priorities with clarity and restraint. (UAT-P02)',
      pressTitle: 'UAT-P02 Media line — Speaker Office reviews fiscal brief',
      pressBody: 'The Speaker Office is reviewing the mid-year budget brief for coordination. No policy announcement. (UAT-P02)',
      greetOcc: 'UAT-P02 New fiscal year office message',
      greetRec: 'Finance and Accounts branch officers',
      greetMsg: 'Best wishes for disciplined financial stewardship. (UAT-P02)',
      workTitle: 'UAT-P02 Research note — PSDP pace comparison',
      workText: 'Compare last three years PSDP utilisation for the briefing pack. (UAT-P02)',
      msg: 'UAT-P02: Kindly share the latest PSDP utilisation sheet for the MoF huddle.',
      search: 'UAT-P02',
      esignPurpose: 'UAT-P02 Seal budget talking-points put-up',
    },
  },
  {
    id: '03',
    tag: 'UAT-P03',
    theme: 'Standing Committee visit — logistics',
    color: '#6b3a1a',
    short: false,
    d: {
      subject: 'UAT-P03 Standing Committee visit — logistics put-up',
      sender: 'Committee Branch',
      body: 'Standing Committee proposes an on-site visit next fortnight. Advise on Speaker availability, room booking and security escort.',
      area: 'Committees',
      note: 'Para 1: UAT-P03 Committee visit file registered. Route Sec Gen.',
      procedure: 'Advise on Committee visit logistics (UAT-P03)',
      ackNote: 'Visit feasible if Chamber free. Spec Sec to lock date and escort plan. (UAT-P03)',
      outcome: 'Procedure complete — propose two alternate dates (UAT-P03).',
      decisionText: 'Proceed. Direction for visit logistics pack (UAT-P03).',
      dirTitle: 'UAT-P03 Prepare Standing Committee visit logistics pack',
      evidence: 'Pack: two dates, room, escort, refreshments — draft attached. (UAT-P03)',
      closeOut: 'UAT-P03 complete — logistics pack accepted.',
      confSubj: 'UAT-P03 Confidential — committee witness list notes',
      confSender: 'Committee Branch (Confidential)',
      confBody: 'CONFIDENTIAL UAT-P03. Witness list notes — vault only.',
      dakInFrom: 'Standing Committee Secretariat',
      dakInSubj: 'UAT-P03 Incoming dak — proposed visit dates',
      dakOutTo: 'Committee Branch — Secretary',
      dakOutSubj: 'UAT-P03 Outward — provisional acceptance of visit window',
      meetTitle: 'UAT-P03 Pre-brief — Standing Committee visit',
      meetLoc: 'Speaker Chamber',
      meetBrief: 'Internal pre-brief with Spec Sec and security. 30 minutes. (UAT-P03)',
      meetAction: 'UAT-P03 Confirm escort roster with security',
      sched1: 'UAT-P03 Diary — committee pre-brief',
      sched2: 'UAT-P03 Overlap attempt — conflict UI',
      callParty: 'Committee Secretary',
      callSum: 'UAT-P03 Call: lock preferred visit date and guest count.',
      speechTitle: 'UAT-P03 Welcome remarks — Committee visit',
      speechBody: 'Members of the Standing Committee, welcome. Your oversight strengthens our parliamentary work. (UAT-P03)',
      pressTitle: 'UAT-P03 Note — Standing Committee visit (routine)',
      pressBody: 'A Standing Committee visit is being scheduled as routine parliamentary business. (UAT-P03)',
      greetOcc: 'UAT-P03 Welcome card — visiting Committee members',
      greetRec: 'Standing Committee members and secretariat',
      greetMsg: 'Welcome to the Speaker Office. We look forward to a constructive visit. (UAT-P03)',
      workTitle: 'UAT-P03 Legislative note — visit room checklist',
      workText: 'Room AV, nameplates, water, security lane, media exclusion zone. (UAT-P03)',
      msg: 'UAT-P03: Please confirm Chamber availability for the Committee visit options.',
      search: 'UAT-P03',
      esignPurpose: 'UAT-P03 Seal committee visit logistics put-up',
    },
  },
  {
    id: '04',
    tag: 'UAT-P04',
    theme: 'Media Day — press coordination',
    color: '#4a1a6b',
    short: false,
    d: {
      subject: 'UAT-P04 Media Day plan — Speaker Office briefing',
      sender: 'DG Media / PID liaison',
      body: 'Media Day proposed for next week. Advise on run-of-show, approved lines, and pool arrangements.',
      area: 'Media',
      note: 'Para 1: UAT-P04 Media Day file in. Route Sec Gen for examine.',
      procedure: 'Examine Media Day plan and advise (UAT-P04)',
      ackNote: 'Proceed with pool only. Spec Sec to clear lines in Press module. (UAT-P04)',
      outcome: 'Procedure complete — pool media; no open Q&A (UAT-P04).',
      decisionText: 'Approved. Direction for Media Day run-of-show (UAT-P04).',
      dirTitle: 'UAT-P04 Finalise Media Day run-of-show and approved lines',
      evidence: 'Run-of-show + three approved lines attached for verify. (UAT-P04)',
      closeOut: 'UAT-P04 complete — Media Day pack accepted.',
      confSubj: 'UAT-P04 Confidential — embargoed interview notes',
      confSender: 'Media Cell (Confidential)',
      confBody: 'CONFIDENTIAL UAT-P04. Embargoed interview notes — vault only.',
      dakInFrom: 'PID — National Assembly Desk',
      dakInSubj: 'UAT-P04 Incoming dak — Media Day concept note',
      dakOutTo: 'DG Media',
      dakOutSubj: 'UAT-P04 Outward — Media Day window confirmation',
      meetTitle: 'UAT-P04 Media coordination huddle',
      meetLoc: 'Media Room',
      meetBrief: 'Confirm pool list and camera positions. (UAT-P04)',
      meetAction: 'UAT-P04 Circulate approved lines to Special Secretary',
      sched1: 'UAT-P04 Diary — Media Day prep',
      sched2: 'UAT-P04 Overlap attempt — conflict',
      callParty: 'PID Desk Officer',
      callSum: 'UAT-P04 Call: confirm pool size and arrival gate for Media Day.',
      speechTitle: 'UAT-P04 Doorstep lines — Media Day',
      speechBody: 'Good morning. Today we brief the media on parliamentary priorities with accuracy and restraint. (UAT-P04)',
      pressTitle: 'UAT-P04 Press release — Media Day at Speaker Office',
      pressBody: 'The Speaker Office will hold a pooled Media Day next week. Accredited media only. (UAT-P04)',
      greetOcc: 'UAT-P04 Appreciation — media pool officers',
      greetRec: 'Accredited pool correspondents and PID liaison',
      greetMsg: 'Thank you for orderly coverage of parliamentary business. (UAT-P04)',
      workTitle: 'UAT-P04 Media checklist — pool and lines',
      workText: 'Pool list, camera positions, approved lines, social hold until dispatch. (UAT-P04)',
      msg: 'UAT-P04: Please review the three approved Media Day lines before dispatch.',
      search: 'UAT-P04',
      esignPurpose: 'UAT-P04 Seal Media Day run-of-show',
    },
  },
  {
    id: '05',
    tag: 'UAT-P05',
    theme: 'National Day greetings — protocol cards',
    color: '#1a6b5a',
    short: false,
    d: {
      subject: 'UAT-P05 National Day greetings — distribution plan',
      sender: 'Protocol / Greetings Cell',
      body: 'Propose bilingual greeting card distribution for National Day. Advise on recipient groups, channels (e-card / print), and authorisation path.',
      area: 'Protocol',
      note: 'Para 1: UAT-P05 Greetings plan registered. Route Sec Gen.',
      procedure: 'Advise on National Day greetings distribution (UAT-P05)',
      ackNote: 'Approve bilingual cards; Spec Sec to draft EN/UR text. (UAT-P05)',
      outcome: 'Procedure complete — recommend e-card + limited print (UAT-P05).',
      decisionText: 'Authorise. Direction for bilingual card draft (UAT-P05).',
      dirTitle: 'UAT-P05 Draft bilingual National Day greeting card',
      evidence: 'EN/UR card draft + recipient categories attached. (UAT-P05)',
      closeOut: 'UAT-P05 complete — greetings draft accepted for dispatch path.',
      confSubj: 'UAT-P05 Confidential — dignitary recipient shortlist',
      confSender: 'Protocol (Confidential)',
      confBody: 'CONFIDENTIAL UAT-P05. Dignitary shortlist for cards — vault only.',
      dakInFrom: 'Cabinet Division — Protocol',
      dakInSubj: 'UAT-P05 Incoming dak — National Day greetings guidance',
      dakOutTo: 'Greetings Cell',
      dakOutSubj: 'UAT-P05 Outward — distribution plan acknowledgement',
      meetTitle: 'UAT-P05 Protocol huddle — greetings distribution',
      meetLoc: 'Protocol Room',
      meetBrief: 'Recipient groups and print quantities. (UAT-P05)',
      meetAction: 'UAT-P05 Confirm print quantity with Special Secretary',
      sched1: 'UAT-P05 Diary — greetings sign-off block',
      sched2: 'UAT-P05 Overlap attempt — conflict',
      callParty: 'Protocol Officer — Greetings',
      callSum: 'UAT-P05 Call: confirm dignitary category counts for cards.',
      speechTitle: 'UAT-P05 Short message — National Day office gathering',
      speechBody: 'Dear colleagues, on this National Day we renew our service to the people and the House. (UAT-P05)',
      pressTitle: 'UAT-P05 Press line — National Day greetings issued',
      pressBody: 'The Speaker Office is issuing National Day greetings through official protocol channels. (UAT-P05)',
      greetOcc: 'UAT-P05 National Day',
      greetRec: 'Diplomatic missions and federal dignitaries',
      greetMsg: 'On this National Day, the Speaker Office extends warm greetings and best wishes. (UAT-P05)',
      workTitle: 'UAT-P05 Protocol note — recipient categories',
      workText: 'Categories: missions, federal ministers, provincial speakers, retired Speakers. (UAT-P05)',
      msg: 'UAT-P05: Please confirm Urdu text for the National Day card before submit.',
      search: 'UAT-P05',
      esignPurpose: 'UAT-P05 Seal National Day greetings plan',
    },
  },
  {
    id: '06',
    tag: 'UAT-P06',
    theme: 'Short smoke — core path only',
    color: '#334155',
    short: true,
    d: {
      subject: 'UAT-P06 Smoke — Speaker diary put-up practice',
      sender: 'Internal QA Desk',
      body: 'Short smoke file. Route to Sec Gen, decide with a direction, then close after evidence.',
      area: 'Administration',
      note: 'Para 1: UAT-P06 smoke register. Route Sec Gen for examine.',
      procedure: 'Examine and advise (UAT-P06 smoke)',
      ackNote: 'Smoke examined OK. Spec Sec can take a short direction. (UAT-P06)',
      outcome: 'Procedure complete — UAT-P06 smoke path.',
      decisionText: 'Smoke decide OK. Issue one short direction. (UAT-P06)',
      dirTitle: 'UAT-P06 One-page smoke briefing',
      evidence: 'UAT-P06 evidence: briefing draft typed.',
      closeOut: 'UAT-P06 smoke complete — file closed.',
      confSubj: 'UAT-P06 Confidential smoke note',
      confSender: 'QA Desk (Confidential)',
      confBody: 'CONFIDENTIAL UAT-P06. Vault unlock + download reason check.',
      dakInFrom: 'QA Desk',
      dakInSubj: 'UAT-P06 Incoming dak — smoke stamp',
      dakOutTo: 'Registry',
      dakOutSubj: 'UAT-P06 Outward dak — smoke stamp',
      meetTitle: 'UAT-P06 Quick meeting smoke',
      meetLoc: 'Chamber',
      meetBrief: 'Optional short meeting for smoke.',
      meetAction: 'UAT-P06 Meeting action smoke',
      sched1: 'UAT-P06 Diary smoke block',
      sched2: 'UAT-P06 Overlap smoke',
      callParty: 'QA Desk',
      callSum: 'UAT-P06 Call smoke log',
      speechTitle: 'UAT-P06 Short remarks smoke',
      speechBody: 'Brief smoke remarks. (UAT-P06)',
      pressTitle: 'UAT-P06 Press smoke line',
      pressBody: 'Smoke press line — no public release. (UAT-P06)',
      greetOcc: 'UAT-P06 Smoke greeting',
      greetRec: 'Internal QA group',
      greetMsg: 'Smoke greeting card text. (UAT-P06)',
      workTitle: 'UAT-P06 Work record smoke',
      workText: 'Short work record for extensions hub. (UAT-P06)',
      msg: 'UAT-P06: Smoke message to Sec Gen.',
      search: 'UAT-P06',
      esignPurpose: 'UAT-P06 smoke seal',
    },
  },
];

function buildModules(p) {
  const d = p.d;
  const tag = p.tag;
  const id = (s) => `${tag}-${s}`;
  const mods = [];

  // M1 Login
  mods.push(
    mod(
      '01',
      'm01',
      'Login & shell',
      'Exact path · ~5 min',
      step(1, {
        id: id('01a'),
        who: 'Account: speaker',
        where: 'Browser → login page',
        title: 'Sign in as Speaker',
        do: [
          `Open <code>${LOGIN}</code>`,
          'On the right, click the <strong>Speaker</strong> role card (username fills as <code>speaker</code>)',
          `Password field: type / paste <code>${PASS}</code>`,
          'Click the primary button to sign in (label is usually the Sign in / Continue control)',
        ],
        data: [
          ['Username', 'speaker'],
          ['Password', PASS],
        ],
        expect: 'You land on Office overview. No “Enable authenticator” / MFA screen. Left nav shows Files, Registry, etc.',
      }) +
        step(2, {
          id: id('01b'),
          who: 'Still speaker',
          where: 'Left nav → Operator guide · Office overview',
          title: 'Confirm Guide + Overview load',
          do: [
            'Click <strong>Operator guide</strong> in the left nav (Help group)',
            'Skim Path A / Path B headings',
            'Click <strong>Office overview</strong> — note KPI cards (counts may be zero on a clean DB)',
            'Optional: use EN / اردو language toggle once, then return to English',
          ],
          expect: 'Guide and Overview render without errors. Language toggle changes labels.',
        }),
      true,
    ),
  );

  // M2 Files full path
  mods.push(
    mod(
      '02',
      'm02',
      'Files — register, summary, route, movement',
      'Left nav: Files & documents · ~20 min',
      step(1, {
        id: id('02a'),
        who: 'Account: speaker',
        where: 'Left nav → Files & documents',
        title: 'Register a new INTERNAL matter',
        do: [
          'Click <strong>+ Register new matter</strong> (top right)',
          'Fill every field below exactly (use Copy)',
          'Classification = <strong>INTERNAL</strong> (not Confidential)',
          'Click <strong>Register</strong>',
          'When the list refreshes, click <strong>Open</strong> on your new row (or open the diary link)',
        ],
        data: [
          ['Subject', d.subject],
          ['Sender', d.sender],
          ['Body', d.body],
          ['Classification', 'INTERNAL'],
          ['Subject area', d.area],
          ['Priority', 'NORMAL'],
        ],
        expect: 'A diary number is assigned (e.g. GOW-…). Matter detail page opens. Journey shows Registered.',
      }) +
        step(2, {
          id: id('02b'),
          who: 'Still speaker · same file',
          where: 'Matter page → Overview + Notes',
          title: 'Noting sheet + Generate / Accept summary (EN then URDU)',
          do: [
            'Open the <strong>Notes</strong> (or noting) section / tab',
            'Add a noting paragraph with the text below → save / submit note',
            'Back on Overview, find panel <strong>Generate summary / Accept summary</strong>',
            'Language dropdown = <strong>English</strong> → click <strong>Generate summary</strong>',
            'Read the textarea → click <strong>Accept summary</strong>',
            'Change language to <strong>اردو</strong> → <strong>Generate summary</strong> again (must not show Internal server error)',
            'Optionally Accept the Urdu summary',
          ],
          data: [['Note text', d.note]],
          expect: 'Noting appears numbered. EN summary accepted with timestamp. Urdu generate succeeds (UTF-8 DB).',
        }) +
        step(3, {
          id: id('02c'),
          who: 'Still speaker · same file',
          where: 'Matter page → Route / procedure',
          title: 'Route to Secretary General',
          do: [
            'Scroll to <strong>Route / procedure</strong>',
            'In the user dropdown, choose <strong>Secretary General</strong> (display name for secgen)',
            'Paste Procedure text below',
            'Optional: set a due date 3 days ahead',
            'Click <strong>Route</strong>',
            'Confirm Journey / route steps update',
          ],
          data: [['Procedure', d.procedure]],
          expect: 'Status awaiting receipt / holder = Secretary General. Toast “Routed”.',
        }) +
        step(4, {
          id: id('02d'),
          who: 'Logout → login as secgen',
          where: 'Left nav → File movement  OR  Inbox  OR  Files',
          title: 'Acknowledge → note → Complete procedure',
          do: [
            'Top bar: logout → login page → pick <strong>Secretary General</strong> → password → sign in',
            'Open <strong>File movement</strong> — find the file waiting for you — Open',
            'On the matter page click <strong>Acknowledge receipt</strong>',
            'Add noting with the text below',
            'Click <strong>Complete procedure</strong> (use outcome text below if a field appears; otherwise confirm toast)',
          ],
          data: [
            ['Username', 'secgen'],
            ['Password', PASS],
            ['Noting', d.ackNote],
            ['Outcome', d.outcome],
          ],
          expect: 'Acknowledged toast; noting on sheet; procedure complete; file moves toward Speaker decision.',
        }),
    ),
  );

  // M3 Decide / directions
  mods.push(
    mod(
      '03',
      'm03',
      'Decide → Directions → evidence → close',
      'Matter decide + Directions tracker · ~15 min',
      step(1, {
        id: id('03a'),
        who: 'Logout → login as speaker',
        where: 'Files → open your INTERNAL matter → Decision section',
        title: 'Record decision = DIRECTION',
        do: [
          'Open your matter (search Subject or Files list)',
          'Find decision form: set type to <strong>DIRECTION</strong> (or equivalent dropdown)',
          'Fill Decision text, Direction title, Owner = <strong>Special Secretary</strong>, due date ~5 days',
          'Click <strong>Record decision</strong>',
        ],
        data: [
          ['Decision text', d.decisionText],
          ['Direction title', d.dirTitle],
          ['Owner', 'Special Secretary'],
        ],
        expect: 'Toast “Decision recorded”. Direction appears under Directions. Spec Sec notified in Inbox.',
      }) +
        step(2, {
          id: id('03b'),
          who: 'Logout → login as specsec',
          where: 'Left nav → Directions',
          title: 'Start work + submit evidence (text AND file)',
          do: [
            'Login as Special Secretary (<code>specsec</code> / password)',
            'Open <strong>Directions</strong> → find title starting with your pack tag',
            'Click <strong>Start work</strong>',
            'Enter Evidence text below',
            'Choose a small file (create a .txt on your PC if needed) — both text and file are required',
            'Click the primary submit evidence button',
          ],
          data: [
            ['Username', 'specsec'],
            ['Password', PASS],
            ['Evidence text', d.evidence],
          ],
          expect: 'Status moves to Evidence submitted (KPI / column updates).',
        }) +
        step(3, {
          id: id('03c'),
          who: 'Logout → login as speaker',
          where: 'Directions → then matter Close',
          title: 'Verify evidence and close the matter',
          do: [
            'Open <strong>Directions</strong> → <strong>Verify</strong> / accept evidence (primary button)',
            'Open the linked matter → use Close / outcome control',
            'Paste close outcome below',
          ],
          data: [['Close outcome', d.closeOut]],
          expect: 'Direction verified/closed. Matter status CLOSED. Journey shows full trail.',
        }),
    ),
  );

  if (p.short) {
    // Short pack: vault, dak, esign, work, audit only after core
    mods.push(...buildShortTail(p, id, d));
    return mods.join('\n');
  }

  // Full pack continues
  mods.push(
    mod(
      '04',
      'm04',
      'Confidential vault',
      'Files register CONFIDENTIAL · ~10 min',
      step(1, {
        id: id('04a'),
        who: 'Account: speaker',
        where: 'Files & documents → + Register new matter',
        title: 'Register CONFIDENTIAL + unlock + download reason',
        do: [
          'Click <strong>+ Register new matter</strong>',
          'Set Classification = <strong>CONFIDENTIAL</strong>',
          'File password field appears — enter vault password below (min 12)',
          'Register → Open matter (or unlock from list with password)',
          'Unlock vault if prompted',
          'Attachments: upload a tiny file',
          'Download: try reason <code>ok</code> (must fail) then the good reason',
        ],
        data: [
          ['Subject', d.confSubj],
          ['Sender', d.confSender],
          ['Body', d.confBody],
          ['Classification', 'CONFIDENTIAL'],
          ['File password', VAULT],
          ['Bad reason', 'ok'],
          ['Good reason', 'Official review for authorised office use'],
        ],
        expect: 'Short reason rejected; good reason downloads. Vault unlock works with VaultTest!01.',
      }),
    ),
  );

  mods.push(
    mod(
      '05',
      'm05',
      'Dak register (R&I)',
      'Left nav: Dak register (R&I) · ~8 min',
      step(1, {
        id: id('05a'),
        who: 'Logout → login as secgen',
        where: 'Left nav → Dak register (R&I)',
        title: 'Stamp IN then OUT',
        do: [
          'Open <strong>Dak register (R&I)</strong>',
          'Under <strong>Stamp dak</strong>, Direction = <strong>IN — Received</strong>',
          'Fill From, Subject, Channel = HAND, Classification = INTERNAL → submit Stamp',
          'Change Direction to <strong>OUT — Despatched</strong>',
          'Fill To + Subject + Channel = INTERNAL → Stamp',
          'Use filters Received (IN) / Despatched (OUT) to confirm both rows',
        ],
        data: [
          ['IN From', d.dakInFrom],
          ['IN Subject', d.dakInSubj],
          ['OUT To', d.dakOutTo],
          ['OUT Subject', d.dakOutSubj],
        ],
        expect: 'Two new rows with stamp time and your officer name.',
      }),
    ),
  );

  mods.push(
    mod(
      '06',
      'm06',
      'Inbox & Messages',
      'My desk · ~8 min',
      step(1, {
        id: id('06a'),
        who: 'Account: speaker',
        where: 'Left nav → Appointment inbox · Encrypted messages',
        title: 'Check Inbox, then message Sec Gen',
        do: [
          'Open <strong>Inbox</strong> — confirm notices from routing / directions exist',
          'Open <strong>Messages</strong> (or from Staff directory → Message)',
          'Start / open thread with Secretary General',
          'Send the message body below',
        ],
        data: [['Message', d.msg]],
        expect: 'Message sent; thread visible.',
      }) +
        step(2, {
          id: id('06b'),
          who: 'Logout → secgen',
          where: 'Messages',
          title: 'Read and reply',
          do: [
            'Login as secgen',
            'Open Messages → open the thread',
            `Reply with: <code>${esc(tag)}: Noted, will follow up.</code>`,
          ],
          expect: 'Reply visible when speaker reopens the thread.',
        }),
    ),
  );

  mods.push(
    mod(
      '07',
      'm07',
      'Meetings & Schedule',
      'Calendar & media · ~15 min',
      step(1, {
        id: id('07a'),
        who: 'Account: secgen → then speaker',
        where: 'Left nav → Meetings',
        title: 'Create meeting → Speaker approves → action',
        do: [
          'As secgen: open <strong>Meetings</strong> → create / request new meeting',
          'Fill Title, Location, Brief (and screening fields if shown)',
          'Save — if conflict UI appears, pick an alternative or Force once',
          'Logout → speaker → open the meeting → <strong>Approve</strong>',
          'Add action with title below; owner Special Secretary; create linked direction if checkbox exists',
        ],
        data: [
          ['Title', d.meetTitle],
          ['Location', d.meetLoc],
          ['Brief', d.meetBrief],
          ['Action title', d.meetAction],
        ],
        expect: 'Meeting APPROVED; action/direction linked.',
      }) +
        step(2, {
          id: id('07b'),
          who: 'Account: speaker',
          where: 'Left nav → Schedule',
          title: 'Book diary then force overlap',
          do: [
            'Open <strong>Schedule</strong>',
            'Create item with first title — tomorrow 11:00–12:00 (adjust if needed)',
            'Create second item overlapping the same hour with second title',
            'Confirm conflict banner + suggested alternatives',
            'Choose an alternative OR Force-book once',
          ],
          data: [
            ['First title', d.sched1],
            ['Overlap title', d.sched2],
          ],
          expect: 'Conflict UI appears; diary shows your items.',
        }),
    ),
  );

  mods.push(
    mod(
      '08',
      'm08',
      'Call register',
      'Files & decisions → Call register · ~8 min',
      step(1, {
        id: id('08a'),
        who: 'Account: speaker',
        where: 'Left nav → Call register',
        title: 'Log call and link matter if listed',
        do: [
          'Open <strong>Call register</strong>',
          'Open new call form',
          'Direction INBOUND; fill Party + Summary; Priority NORMAL',
          'If matter picker lists your INTERNAL file, link it',
          'Save / Log call',
        ],
        data: [
          ['Party', d.callParty],
          ['Summary', d.callSum],
        ],
        expect: 'Call appears in table; optional link to matter shown.',
      }),
    ),
  );

  mods.push(
    mod(
      '09',
      'm09',
      'Remote e-sign',
      'Remote work & E-sign · ~10 min',
      step(1, {
        id: id('09a'),
        who: 'Account: speaker (requester and signer)',
        where: 'Matter e-sign panel OR Remote work & E-sign',
        title: 'Request seal → Review & seal → Verify',
        do: [
          'Open your INTERNAL matter → Remote e-sign panel, OR open <strong>Remote work & E-sign</strong> → <strong>+ Request remote seal</strong>',
          'Select the matter; Designated signer = Office Speaker (yourself)',
          'Purpose + Method = Local PKI (RSA-SHA256)',
          'Click <strong>Request remote seal</strong> / Queue',
          'On Remote page, pending card → <strong>Review & seal</strong>',
          'Read preview hash → click <strong>E-Sign & Seal Document</strong>',
          'In ledger click <strong>Verify seal</strong>',
        ],
        data: [['Purpose', d.esignPurpose]],
        expect: 'Status SIGNED. Verify shows valid RSA + hash. No “Document changed since preview” error.',
      }),
    ),
  );

  mods.push(
    mod(
      '10',
      'm10',
      'Speeches, Press, Greetings',
      'Calendar & media · ~25 min',
      step(1, {
        id: id('10a'),
        who: 'specsec → speaker',
        where: 'Left nav → Speeches',
        title: 'Draft speech → Submit → Authorize → Prompter',
        do: [
          'Login as specsec → <strong>Speeches</strong> → new / draft form',
          'Fill Title + Body (EN); optional matter link',
          'If AI assist used, complete human-review checkbox/action',
          'Click <strong>Submit for authorization</strong>',
          'Logout → speaker → open speech → <strong>Authorize speech</strong>',
          'Open prompter view briefly (scroll/font), then close',
        ],
        data: [
          ['Title', d.speechTitle],
          ['Body', d.speechBody],
        ],
        expect: 'Speech APPROVED; prompter shows text.',
      }) +
        step(2, {
          id: id('10b'),
          who: 'specsec → speaker',
          where: 'Left nav → Press & media',
          title: 'Draft press → Submit → Authorize',
          do: [
            'As specsec: <strong>Press & media</strong> → new release',
            'Title + Body → human review if needed → Submit',
            'As speaker: Approve / Dispatch as available',
          ],
          data: [
            ['Title', d.pressTitle],
            ['Body', d.pressBody],
          ],
          expect: 'Release APPROVED or DISPATCHED.',
        }) +
        step(3, {
          id: id('10c'),
          who: 'specsec → speaker',
          where: 'Left nav → Greeting cards',
          title: 'Greeting card → Authorize → Dispatch',
          do: [
            'As specsec: create card — Occasion, Recipient, Message, channel PROTOCOL_ECARD',
            'Submit after human review if required',
            'As speaker: Authorize → Dispatch',
          ],
          data: [
            ['Occasion', d.greetOcc],
            ['Recipient', d.greetRec],
            ['Message', d.greetMsg],
          ],
          expect: 'Card DISPATCHED with GC / dispatch reference.',
        }),
    ),
  );

  mods.push(
    mod(
      '11',
      'm11',
      'Work records, People, Search, AI, Audit',
      'Research & records + Governance · ~20 min',
      step(1, {
        id: id('11a'),
        who: 'Account: speaker',
        where: 'Left nav → Work records',
        title: 'Create work record → Submit → Approve + check filters',
        do: [
          'Open <strong>Work records</strong> → <strong>+ New work record</strong>',
          'Category BRIEF; fill Title + Text → Save draft',
          'Actions → Submit for approval → Approve (Speaker)',
          'Use filters Briefs / Media / Correspondence — confirm sibling rows + Open module',
        ],
        data: [
          ['Title', d.workTitle],
          ['Text', d.workText],
        ],
        expect: 'WR-… code; APPROVED; deep links open Speeches/Press/Calls.',
      }) +
        step(2, {
          id: id('11b'),
          who: 'speaker · then admin',
          where: 'Staff directory · Search · AI helper · Audit dashboard',
          title: 'Directory, search, AI question, audit',
          do: [
            'Open <strong>Staff directory</strong> — search “Secretary” — Message link works',
            'Open <strong>Search</strong> — query your pack tag',
            'Open <strong>AI helper</strong> — ask a short question about your tag / open work',
            'Logout → <code>admin</code> → <strong>Audit dashboard</strong> — find your actions; verify chain if shown',
          ],
          data: [
            ['Search', d.search],
            ['Admin user', 'admin'],
            ['Admin password', PASS],
          ],
          expect: 'Search hits your records; AI responds; audit lists create/route/seal/approve events.',
        }),
    ),
  );

  return mods.join('\n');
}

function buildShortTail(p, id, d) {
  return [
    mod(
      '04',
      'm04',
      'Vault + Dak + E-sign (short)',
      '~20 min',
      step(1, {
        id: id('04a'),
        who: 'speaker',
        where: 'Files → Register CONFIDENTIAL',
        title: 'Confidential unlock + download reason',
        do: [
          'Register CONFIDENTIAL with vault password',
          'Unlock, attach tiny file',
          'Download: bad reason fails; good reason works',
        ],
        data: [
          ['Subject', d.confSubj],
          ['Body', d.confBody],
          ['File password', VAULT],
          ['Good reason', 'Official smoke review'],
        ],
        expect: 'Vault + download reason gate work.',
      }) +
        step(2, {
          id: id('04b'),
          who: 'secgen',
          where: 'Dak register (R&I)',
          title: 'Stamp IN and OUT',
          do: ['Stamp IN then OUT with subjects below'],
          data: [
            ['IN Subject', d.dakInSubj],
            ['OUT Subject', d.dakOutSubj],
          ],
          expect: 'Both stamps listed.',
        }) +
        step(3, {
          id: id('04c'),
          who: 'speaker',
          where: 'Remote work & E-sign',
          title: 'Request + seal + verify',
          do: [
            'Request remote seal on INTERNAL matter (signer = yourself, Local PKI)',
            'Review & seal → E-Sign & Seal Document → Verify seal',
          ],
          data: [['Purpose', d.esignPurpose]],
          expect: 'SIGNED and Verify valid.',
        }),
    ),
    mod(
      '05',
      'm05',
      'Work records + Audit (short)',
      '~10 min',
      step(1, {
        id: id('05a'),
        who: 'speaker → admin',
        where: 'Work records · Search · Audit',
        title: 'Work record + search + audit',
        do: [
          'Create/submit/approve one work record',
          'Search your pack tag',
          'As admin open Audit dashboard',
        ],
        data: [
          ['Title', d.workTitle],
          ['Text', d.workText],
          ['Search', d.search],
        ],
        expect: 'WR approved; search hits; audit shows your actions.',
      }),
    ),
  ];
}

function buildPackHtml(p) {
  const modules = buildModules(p);
  const toc = p.short
    ? `<a href="#access">Start</a><a href="#m01">01 Login</a><a href="#m02">02 Files</a><a href="#m03">03 Decide</a><a href="#m04">04 Vault/Dak/E-sign</a><a href="#m05">05 Work/Audit</a><a href="#feedback">Feedback</a>`
    : `<a href="#access">Start</a><a href="#m01">01 Login</a><a href="#m02">02 Files</a><a href="#m03">03 Decide</a><a href="#m04">04 Vault</a><a href="#m05">05 Dak</a><a href="#m06">06 Messages</a><a href="#m07">07 Meet/Sched</a><a href="#m08">08 Calls</a><a href="#m09">09 E-sign</a><a href="#m10">10 Media</a><a href="#m11">11 Records</a><a href="#feedback">Feedback</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pack ${esc(p.id)} · ${esc(p.tag)} — UAT handoff</title>
<style>${CSS.replace('VAR_PINE', p.color)}</style>
</head>
<body>
<div class="wrap">
<header class="hero">
  <div class="eyebrow">Self-guided UAT · Exact steps</div>
  <h1>Pack ${esc(p.id)}</h1>
  <div class="tag">${esc(p.tag)}</div>
  <p><strong>Theme:</strong> ${esc(p.theme)}. ${
    p.short ? 'Short smoke (~45–60 min).' : 'Full module tour (~2–2.5 hours).'
  }
  Follow steps <em>in order</em>. Use Copy for every field. Always keep prefix <code>${esc(p.tag)}</code> in subjects you create.</p>
  <div class="actions">
    <a class="btn primary" href="${LOGIN}" target="_blank" rel="noopener">Open login</a>
    <button class="btn" type="button" id="expand-all">Expand all</button>
    <button class="btn" type="button" onclick="window.print()">Print / PDF</button>
    <button class="btn" type="button" id="copy-results">Copy results</button>
    <a class="btn" href="./TESTER_HANDOFF.html">All packs</a>
  </div>
</header>
<nav class="toc">${toc}</nav>

<section class="card" id="access">
  <h2>Before you start</h2>
  <p class="lead">Keep this guide beside the app. Switch accounts only when the step says so (top-bar logout).</p>
  <div class="creds">
    <div class="cred"><div class="lbl">Web</div><div class="val">${esc(LOGIN)}</div><button type="button" data-copy="${esc(LOGIN)}">Copy</button></div>
    <div class="cred"><div class="lbl">Password (all)</div><div class="val">${esc(PASS)}</div><button type="button" data-copy="${esc(PASS)}">Copy</button></div>
    <div class="cred vault"><div class="lbl">Vault password</div><div class="val">${esc(VAULT)}</div><button type="button" data-copy="${esc(VAULT)}">Copy</button></div>
    <div class="cred"><div class="lbl">Your pack prefix</div><div class="val">${esc(p.tag)}</div><button type="button" data-copy="${esc(p.tag)}">Copy</button></div>
  </div>
  <div class="scroll">
    <table>
      <thead><tr><th>Username</th><th>Role card on login</th><th>Use when guide says</th></tr></thead>
      <tbody>
        <tr><td><code>speaker</code></td><td>Speaker</td><td>Decide, approve, vault, e-sign, authorize</td></tr>
        <tr><td><code>secgen</code></td><td>Secretary General</td><td>Ack files, dak, meetings</td></tr>
        <tr><td><code>specsec</code></td><td>Special Secretary</td><td>Directions evidence, speeches, press, greetings</td></tr>
        <tr><td><code>admin</code></td><td>(type username admin)</td><td>Audit at the end</td></tr>
      </tbody>
    </table>
  </div>
  <div class="callout">MFA must stay off. If “Enable authenticator” appears, stop and report. Database should be a clean UAT slate (<code>npm run prepare:uat -w @gow/api</code>).</div>
</section>

${modules}

<section class="card" id="feedback">
  <h2>Finish</h2>
  <p class="lead">Click <strong>Copy results</strong> and paste into email/chat with your pack id <code>${esc(p.tag)}</code>.</p>
  <div class="callout warn">Do not run automated smoke against the shared preview during UAT.</div>
  <div class="actions"><button class="btn primary" type="button" id="copy-results-2">Copy results</button></div>
</section>
<footer>Pack ${esc(p.id)} · ${esc(p.tag)} · Government Office Workflow</footer>
</div>
<script>
(function(){
  var PACK=${JSON.stringify(p.tag)};
  document.querySelectorAll(".mark").forEach(function(el){
    var id=el.getAttribute("data-id")||"S";
    el.innerHTML='<label><input type="radio" name="'+id+'" value="Done"/> Done</label>'+
      '<label><input type="radio" name="'+id+'" value="Fail"/> Fail</label>'+
      '<label><input type="radio" name="'+id+'" value="Blocked"/> Blocked</label>'+
      '<textarea placeholder="Note if Fail / Blocked"></textarea>';
  });
  document.querySelectorAll("button[data-copy], .cp").forEach(function(btn){
    btn.addEventListener("click",function(){
      var text=btn.getAttribute("data-copy");
      if(!text){var v=btn.parentElement&&btn.parentElement.querySelector("[data-v]");text=v?v.textContent:"";}
      if(!text)return;
      navigator.clipboard.writeText(text).then(function(){var o=btn.textContent;btn.textContent="Copied";setTimeout(function(){btn.textContent=o},900)});
    });
  });
  document.getElementById("expand-all").onclick=function(){document.querySelectorAll("details.mod").forEach(function(d){d.open=true})};
  function copyResults(){
    var lines=["UAT results — "+PACK,"Pack id: "+PACK,"Date: "+new Date().toISOString().slice(0,10),"Environment: ${LOGIN}","","Step | Result | Notes"];
    document.querySelectorAll(".mark").forEach(function(el){
      var id=el.getAttribute("data-id");
      var c=el.querySelector('input[type=radio]:checked');
      var n=(el.querySelector("textarea")||{}).value||"";
      lines.push(id+" | "+(c?c.value:"-")+" | "+n.replace(/\\n/g," "));
    });
    lines.push("","Blockers:","UX issues:","Missing vs office practice:");
    navigator.clipboard.writeText(lines.join("\\n"));
    alert("Results copied.");
  }
  document.getElementById("copy-results").onclick=copyResults;
  document.getElementById("copy-results-2").onclick=copyResults;
})();
</script>
</body></html>`;
}

function buildIndex() {
  const cards = PACKS.map(
    (p) => `<a class="pack" href="./TESTER_HANDOFF_${p.id}.html" style="border-top-color:${p.color}">
      <div class="pack-tag">${esc(p.tag)}${p.short ? ' · short' : ' · full'}</div>
      <strong>Pack ${esc(p.id)}</strong>
      <span>${esc(p.theme)}</span>
      <span class="go">Open →</span>
    </a>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>UAT handoff — packs</title>
<style>
:root{--ink:#1a2332;--muted:#5c6b7a;--line:#d8dee6;--paper:#f7f5f1;--pine:#1e4d3a;--font:"Segoe UI",system-ui,sans-serif;--mono:Consolas,monospace}
body{margin:0;font-family:var(--font);color:var(--ink);background:var(--paper);line-height:1.55}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 80px}
.hero{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;margin-bottom:18px}
h1{margin:0 0 8px}p{color:var(--muted)}code{font-family:var(--mono);background:#eef2f6;padding:.1em .35em;border-radius:4px}
.grid{display:grid;gap:10px}.pack{display:block;background:#fff;border:1px solid var(--line);border-top:4px solid var(--pine);border-radius:12px;padding:16px 18px;text-decoration:none;color:inherit}
.pack:hover{border-color:var(--pine)}.pack-tag{font-family:var(--mono);font-size:.82rem;color:var(--pine);font-weight:700}
.pack strong{display:block;margin:4px 0;font-size:1.05rem}.pack span{display:block;color:var(--muted);font-size:.9rem}
.pack .go{margin-top:8px;color:var(--pine);font-weight:700}.note{background:#e8f2ec;border-radius:10px;padding:12px 14px;margin-top:16px;font-size:.9rem}
</style></head><body><div class="wrap">
<header class="hero">
<h1>UAT handoff packs</h1>
<p>One HTML file per person. Prefixes <code>UAT-P01</code>…<code>UAT-P06</code> keep data separate on a shared preview. Steps use exact left-nav labels and button names from the app.</p>
<div class="note"><strong>Before UAT:</strong> <code>npm run prepare:uat -w @gow/api</code><br/>
Password <code>${PASS}</code> · Vault <code>${VAULT}</code><br/>
<a href="${LOGIN}">${LOGIN}</a></div>
</header>
<div class="grid">${cards}</div>
<div class="note">Regenerate: <code>node docs/generate-tester-handoffs.mjs</code></div>
</div></body></html>`;
}

for (const p of PACKS) {
  const path = join(__dirname, `TESTER_HANDOFF_${p.id}.html`);
  writeFileSync(path, buildPackHtml(p), 'utf8');
  console.log('Wrote', path);
}
writeFileSync(join(__dirname, 'TESTER_HANDOFF.html'), buildIndex(), 'utf8');
const md = [
  '# UAT handoff packs',
  '',
  '**Index:** [TESTER_HANDOFF.html](./TESTER_HANDOFF.html)',
  '',
  '| Pack | File | Prefix | Length | Theme |',
  '|------|------|--------|--------|-------|',
  ...PACKS.map(
    (p) =>
      `| Pack ${p.id} | [TESTER_HANDOFF_${p.id}.html](./TESTER_HANDOFF_${p.id}.html) | \`${p.tag}\` | ${p.short ? 'Short' : 'Full'} | ${p.theme} |`,
  ),
  '',
  'No personal names — only pack numbers and `UAT-P0x` prefixes.',
  '',
  'Steps use exact nav labels (`Files & documents`, `Dak register (R&I)`, `Acknowledge receipt`, `Generate summary`, `E-Sign & Seal Document`, etc.).',
  '',
  '```bash',
  'npm run prepare:uat -w @gow/api',
  'node docs/generate-tester-handoffs.mjs',
  '```',
  '',
].join('\n');
writeFileSync(join(__dirname, 'TESTER_HANDOFF.md'), md, 'utf8');
console.log('Wrote index + md');
