/**
 * Filters deep links before the router sees them.
 *
 * Google sign-in returns to the app on `<package or reversed client ID>:/oauthredirect`.
 * expo-auth-session reads that URL itself, so the router must not navigate to
 * it — there is no such screen, and it would show "Unmatched route". Returning
 * null leaves the user on the sign-in screen while the sign-in completes.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  if (path.includes('oauthredirect')) return null;
  return path;
}
