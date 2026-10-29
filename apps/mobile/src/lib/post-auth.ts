import type { useRouter } from 'expo-router';
import { request } from '../api/client';
import type { Me } from '../api/hooks';

/**
 * Where to land someone right after they sign in or sign up.
 *
 * The branch is decided by the backend's `onboardedAt`, not by which auth
 * screen they came through — the API auto-provisions an account on first
 * authenticated request, so this is the one place that actually knows whether
 * onboarding has been completed, regardless of provider.
 */
export async function routeAfterAuth(router: ReturnType<typeof useRouter>): Promise<void> {
  try {
    const me = await request<Me>('/me');
    router.replace(me.onboardedAt ? '/' : '/onboarding');
  } catch {
    // The account exists in Firebase even if this first API call failed
    // (offline, cold start) — send them onward rather than stranding them on
    // the sign-in screen with no way forward.
    router.replace('/onboarding');
  }
}
