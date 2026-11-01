'use client';

import { useState, useTransition } from 'react';
import { reviewArtistClaim } from '../actions';

/**
 * Approve / reject controls for one claim.
 *
 * Approval hands someone the keys to a public profile, so it asks for a
 * confirmation first; rejection is cheap to undo (the claimant can resubmit).
 */
export function ClaimActions({ claimId, artistName }: { claimId: string; artistName: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (decision: 'approve' | 'reject') =>
    startTransition(async () => {
      const outcome = await reviewArtistClaim(claimId, decision);
      setResult(outcome.message);
      setConfirming(false);
    });

  return (
    <div style={{ marginTop: 14 }}>
      <div className="actions">
        {confirming ? (
          <>
            <button disabled={pending} onClick={() => run('approve')}>
              Confirm: verify and hand over {artistName}
            </button>
            <button className="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button disabled={pending} onClick={() => setConfirming(true)}>
              Approve
            </button>
            <button className="danger" disabled={pending} onClick={() => run('reject')}>
              Reject
            </button>
          </>
        )}
      </div>

      {result ? (
        <p className="hint" style={{ marginTop: 8 }} role="status">
          {result}
        </p>
      ) : null}
    </div>
  );
}
