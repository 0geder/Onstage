/**
 * Output safety for data that came from ingestion or admin input.
 *
 * Event titles, descriptions and URLs arrive from third-party feeds and the
 * CMS, so the public site treats them as untrusted when they land somewhere
 * the browser would execute: inline <script> blocks and link targets.
 */

/**
 * JSON for an inline <script type="application/ld+json">. JSON.stringify alone
 * leaves "</script>" intact, which would end the block and let the rest run
 * as HTML; escaping <, > and & as unicode keeps the JSON identical to parsers.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** The URL if it is http(s), otherwise undefined — never a javascript: or data: link. */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
