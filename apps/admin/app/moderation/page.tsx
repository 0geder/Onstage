import { adminRequest, type QueuedComment } from '../../lib/api';
import { ModerationActions } from './actions-client';

export const dynamic = 'force-dynamic';

/**
 * Human review queue.
 *
 * Automated scoring flags and hides; it never decides. Everything here is
 * waiting for a person, and the signals that produced the score are shown so
 * the moderator can judge the reasoning rather than trust a number.
 */
export default async function ModerationPage() {
  let queue: QueuedComment[] = [];
  let error: string | null = null;

  try {
    queue = await adminRequest<QueuedComment[]>('/admin/moderation/queue?limit=50');
  } catch (caught) {
    error = (caught as Error).message;
  }

  if (error) {
    return (
      <>
        <h2>Moderation</h2>
        <div className="error">{error}</div>
      </>
    );
  }

  return (
    <>
      <h2>Moderation</h2>
      <p className="subtitle">
        Reported and auto-flagged comments, worst score first. Nothing is removed permanently — a
        hidden comment stays here for review.
      </p>

      {queue.length === 0 ? (
        <div className="card">Nothing waiting. The queue is clear.</div>
      ) : (
        queue.map((comment) => {
          const accountAgeDays = Math.floor(
            (Date.now() - new Date(comment.author.createdAt).getTime()) / 86_400_000,
          );

          return (
            <div key={comment.id} className="card">
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <div className="actions">
                  <span
                    className={`pill ${
                      comment.scamScore >= 70
                        ? 'pill-danger'
                        : comment.scamScore >= 40
                          ? 'pill-warn'
                          : 'pill-muted'
                    }`}
                  >
                    score {comment.scamScore}
                  </span>
                  <span className="pill pill-muted">{comment.moderationState}</span>
                  {comment.isHidden ? <span className="pill pill-danger">hidden</span> : null}
                  <span className="pill pill-muted">{comment.tag}</span>
                </div>

                <span className="hint">{new Date(comment.createdAt).toLocaleString('en-ZA')}</span>
              </div>

              <p style={{ margin: '12px 0', whiteSpace: 'pre-wrap' }}>{comment.body}</p>

              <div className="hint">
                @{comment.author.handle} ({comment.author.displayName}) ·{' '}
                {/* Account age is the single most useful signal on a resale post. */}
                <strong style={{ color: accountAgeDays < 1 ? 'var(--warn)' : 'inherit' }}>
                  account {accountAgeDays === 0 ? 'created today' : `${accountAgeDays} days old`}
                </strong>{' '}
                · on {comment.event.title}
              </div>

              {comment.scamSignals.length > 0 ? (
                <div className="hint" style={{ marginTop: 8 }}>
                  Signals:{' '}
                  {comment.scamSignals.map((signal) => `${signal.detail} (+${signal.weight})`).join(' · ')}
                </div>
              ) : null}

              {comment.openReports.length > 0 ? (
                <div className="hint" style={{ marginTop: 8 }}>
                  Reports: {comment.openReports.map((report) => report.reason).join(', ')}
                </div>
              ) : null}

              <ModerationActions
                commentId={comment.id}
                userId={comment.author.id}
                isHidden={comment.isHidden}
                handle={comment.author.handle}
              />
            </div>
          );
        })
      )}
    </>
  );
}
