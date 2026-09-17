'use client';

import { useState, useTransition } from 'react';
import { banUser, moderateComment } from '../actions';

/**
 * Moderation controls.
 *
 * Banning asks for a reason and confirms first. It hides everything the account
 * has posted, so doing it by accident is expensive — a deliberate speed bump on
 * the one action here that is hard to walk back.
 */
export function ModerationActions({
  commentId,
  userId,
  isHidden,
  handle,
}: {
  commentId: string;
  userId: string;
  isHidden: boolean;
  handle: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [banning, setBanning] = useState(false);
  const [reason, setReason] = useState('');

  const run = (task: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const outcome = await task();
      setResult(outcome.message);
    });

  return (
    <div style={{ marginTop: 14 }}>
      <div className="actions">
        {isHidden ? (
          <button
            className="secondary"
            disabled={pending}
            onClick={() => run(() => moderateComment(commentId, 'restore'))}
          >
            Restore
          </button>
        ) : (
          <button
            className="danger"
            disabled={pending}
            onClick={() => run(() => moderateComment(commentId, 'hide'))}
          >
            Hide
          </button>
        )}

        <button className="secondary" disabled={pending} onClick={() => setBanning((open) => !open)}>
          Ban @{handle}
        </button>
      </div>

      {banning ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8, maxWidth: 480 }}>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for the ban (recorded against the account)"
            aria-label="Ban reason"
          />
          <div className="actions">
            <button
              className="danger"
              disabled={pending || reason.trim().length < 3}
              onClick={() => {
                run(() => banUser(userId, reason.trim()));
                setBanning(false);
                setReason('');
              }}
            >
              Confirm ban
            </button>
            <button className="secondary" onClick={() => setBanning(false)}>
              Cancel
            </button>
          </div>
          <p className="hint">
            This hides every comment the account has posted. Use it for scams and repeat abuse.
          </p>
        </div>
      ) : null}

      {result ? (
        <p className="hint" style={{ marginTop: 8 }} role="status">
          {result}
        </p>
      ) : null}
    </div>
  );
}
