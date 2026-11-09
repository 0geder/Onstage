import { useState } from 'react';

/**
 * Posters and photos come from ticketing sites, which delete or lock them
 * without notice. A dead link would otherwise leave an empty frame where the
 * artwork should be, so a URL that fails once is skipped everywhere for the
 * rest of the session and the next candidate (or the text fallback) shows.
 */
const broken = new Set<string>();

export function useWorkingImage(...candidates: (string | null | undefined)[]) {
  const [, rerender] = useState(0);
  const uri = candidates.find((candidate): candidate is string =>
    Boolean(candidate && !broken.has(candidate)),
  );
  const onError = () => {
    if (!uri) return;
    broken.add(uri);
    rerender((count) => count + 1);
  };
  return { uri: uri ?? null, onError };
}
