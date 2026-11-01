import { adminRequest, type QueuedArtistClaim } from '../../lib/api';
import { ClaimActions } from './actions-client';

export const dynamic = 'force-dynamic';

/**
 * Artist profile claims.
 *
 * Imported profiles are unverified until a real artist claims one and a person
 * here checks it. There is no automatic check: the evidence, the link offered
 * and the links already on the profile are laid out side by side so the
 * operator can confirm the claim through a channel the artist controls.
 */
export default async function ClaimsPage() {
  let queue: QueuedArtistClaim[] = [];
  let error: string | null = null;

  try {
    queue = await adminRequest<QueuedArtistClaim[]>('/admin/artist-claims?limit=50');
  } catch (caught) {
    error = (caught as Error).message;
  }

  if (error) {
    return (
      <>
        <h2>Artist claims</h2>
        <div className="error">{error}</div>
      </>
    );
  }

  return (
    <>
      <h2>Artist claims</h2>
      <p className="subtitle">
        Pending claims, oldest first. Approving marks the profile verified and lets the claimant
        edit its bio, home city and links. Confirm through an official channel before approving.
      </p>

      {queue.length === 0 ? (
        <div className="card">Nothing waiting. The queue is clear.</div>
      ) : (
        queue.map((claim) => {
          const accountAgeDays = daysSince(claim.claimant.createdAt);
          const profileLinks = [
            ...Object.entries(claim.artist.socialLinks ?? {}),
            ...Object.entries(claim.artist.streamingLinks ?? {}),
          ];

          return (
            <div key={claim.id} className="card">
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <div className="actions">
                  <strong>{claim.artist.name}</strong>
                  <span className="hint">/{claim.artist.slug}</span>
                  {claim.artist.verified ? (
                    <span className="pill pill-ok">verified</span>
                  ) : (
                    <span className="pill pill-muted">unverified</span>
                  )}
                  {/* A second approval is allowed (member and manager), but never by accident. */}
                  {claim.managedBy.length > 0 ? (
                    <span className="pill pill-warn">
                      managed by {claim.managedBy.map((handle) => `@${handle}`).join(', ')}
                    </span>
                  ) : null}
                </div>

                <span className="hint">{new Date(claim.createdAt).toLocaleString('en-ZA')}</span>
              </div>

              <p style={{ margin: '12px 0', whiteSpace: 'pre-wrap' }}>{claim.evidence}</p>

              {claim.contactUrl ? (
                <div className="hint">
                  Link offered:{' '}
                  <a href={claim.contactUrl} target="_blank" rel="noopener noreferrer">
                    {claim.contactUrl}
                  </a>
                </div>
              ) : (
                <div className="hint">No link offered.</div>
              )}

              {profileLinks.length > 0 ? (
                <div className="hint" style={{ marginTop: 8 }}>
                  Already on the profile:{' '}
                  {profileLinks.map(([platform, url], index) => (
                    <span key={platform}>
                      {index > 0 ? ' · ' : null}
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {platform}
                      </a>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="hint" style={{ marginTop: 8 }}>
                @{claim.claimant.handle} ({claim.claimant.displayName}) · {claim.claimant.email} ·{' '}
                <strong style={{ color: accountAgeDays < 1 ? 'var(--warn)' : 'inherit' }}>
                  account {accountAgeDays === 0 ? 'created today' : `${accountAgeDays} days old`}
                </strong>
              </div>

              <ClaimActions claimId={claim.id} artistName={claim.artist.name} />
            </div>
          );
        })
      )}
    </>
  );
}

/** Whole days since a timestamp. Rendered fresh per request, so reading the clock here is intended. */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
