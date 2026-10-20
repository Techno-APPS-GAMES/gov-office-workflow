'use client';

import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/components/AuthProvider';

export default function GuidePage() {
  const { label } = useAuth();
  return (
    <>
      <PageHeader
        title={label('guide')}
        subtitle="How to exercise the production file-routing workflow end to end."
      />
      <div className="panel">
        <h2>Path A — Core file flow</h2>
        <ol>
          <li>Sign in as Speaker → Files &amp; documents → Register matter (attach PDF if needed).</li>
          <li>Open the matter → Route to Secretary General with a procedure (optional due date).</li>
          <li>Switch to Sec Gen → Acknowledge receipt → add noting paras → Complete procedure (or Return with remarks).</li>
          <li>Speaker → Record decision (Approve / Reject / Direction / No further action).</li>
          <li>If Direction: owner Start → Submit evidence (text + file) → Speaker Review evidence.</li>
          <li>Speaker → Close matter when linked directions are closed. Check Journey for the full trail.</li>
        </ol>
      </div>
      <div className="panel">
        <h2>Path B — Confidential vault</h2>
        <ol>
          <li>Register with classification Confidential and a file password (min 12 characters).</li>
          <li>Unlock from Files or Confidential vault (time-boxed grant, ~30 minutes).</li>
          <li>Attachments are encrypted; download only while unlocked.</li>
          <li>Route / acknowledge / decide as in Path A — each officer unlocks with the same file password.</li>
          <li>Use Verify ledger on the vault page to check the audit chain.</li>
        </ol>
      </div>
      <div className="panel">
        <h2>Pilot habits</h2>
        <ul>
          <li>
            <strong>Noting sheet</strong> — numbered, append-only paras (Note / Put up / Observation).
          </li>
          <li>
            <strong>Return with remarks</strong> — send the file back; recipient must acknowledge.
          </li>
          <li>
            <strong>Directions</strong> — require title, owner, and due date; evidence needs a file.
          </li>
          <li>
            <strong>Related matters</strong> — search by diary/subject and link (no UUIDs).
          </li>
          <li>
            <strong>Versions</strong> — save working drafts with a reason; earlier text stays hashed.
          </li>
          <li>
            Demo may skip MFA TOTP; pilot sets <code>PILOT_MODE=true</code> and forbids skip flags.
          </li>
        </ul>
      </div>
      <div className="panel">
        <h2>Seed accounts</h2>
        <p className="muted">
          Default password from seed: <code>ChangeMe!Office1</code> (or <code>SEED_PASSWORD</code>).
          Users: speaker, secgen, specsec, dgit, admin.
        </p>
      </div>
    </>
  );
}
