import { STORE_LINKS } from '../lib/api';

/**
 * Hand-off to the app.
 *
 * A visitor arriving from a shared link either has the app or does not. The
 * deep link opens it when installed; the store links catch everyone else. No
 * interstitial, no forced redirect — the page itself is useful, and burying it
 * behind a "open in app" wall is how you lose the search traffic that brought
 * them here in the first place.
 */
export function AppBanner({ deepLink, label }: { deepLink: string; label: string }) {
  return (
    <aside className="app-banner">
      <div>
        <strong>{label}</strong>
        <p className="faint" style={{ margin: '4px 0 0' }}>
          Follow artists, get on-sale alerts and see who else is going.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* Tries the installed app first. If nothing handles the scheme the
            browser simply stays put, which is why the store links sit beside it
            rather than behind a timeout hack. */}
        <a className="cta" href={deepLink}>
          Open in app
        </a>
        <a className="cta cta-secondary" href={STORE_LINKS.ios} rel="nofollow">
          App Store
        </a>
        <a className="cta cta-secondary" href={STORE_LINKS.android} rel="nofollow">
          Google Play
        </a>
      </div>
    </aside>
  );
}
