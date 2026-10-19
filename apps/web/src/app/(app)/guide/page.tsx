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
        <h2>Core path</h2>
        <ol>
          <li>Sign in as Speaker → Files &amp; documents → Register matter (attach PDF if needed).</li>
          <li>Open the matter → Route to Secretary General with a procedure.</li>
          <li>Switch role → Acknowledge receipt → Complete procedure.</li>
          <li>Speaker → Record decision (optionally issue a direction).</li>
          <li>Audit dashboard → Verify hash chain.</li>
        </ol>
      </div>
      <div className="panel">
        <h2>Confidential vault</h2>
        <p className="muted">
          Register with classification Confidential and a file password. Unlock from Confidential vault
          for a time-boxed grant, then open the matter.
        </p>
      </div>
    </>
  );
}
