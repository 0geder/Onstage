import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Artist,
  ArtistSearchResult,
  ArtistSummary,
  CommentSort,
  CommentTag,
  CommentThread,
  DiscoveryFeed,
  EventDetail,
  EventSummary,
  Paginated,
  ThreadComment,
} from '@onstage/shared';
import { request } from './client';

/**
 * Data access for the screens.
 *
 * Read queries that a user would be upset to lose offline pass a cache key, so
 * the client can serve the last good copy when the network is gone. Writes never
 * do — a stale write is worse than an error.
 */

export const queryKeys = {
  search: (q: string) => ['search', q] as const,
  artist: (idOrSlug: string) => ['artist', idOrSlug] as const,
  artistEvents: (id: string, scope: string) => ['artist', id, 'events', scope] as const,
  similar: (id: string) => ['artist', id, 'similar'] as const,
  event: (idOrSlug: string) => ['event', idOrSlug] as const,
  travel: (id: string) => ['event', id, 'travel'] as const,
  going: (id: string) => ['event', id, 'going'] as const,
  thread: (id: string, thread: string, tag: string, sort: string) =>
    ['event', id, 'thread', thread, tag, sort] as const,
  feed: (lat?: number, lng?: number, radius?: number, genres?: string[]) =>
    ['feed', lat, lng, radius, (genres ?? []).join(',')] as const,
  me: () => ['me'] as const,
  following: () => ['me', 'following'] as const,
  plans: () => ['me', 'plans'] as const,
  badges: () => ['me', 'badges'] as const,
  consents: () => ['me', 'consents'] as const,
  referral: () => ['me', 'referral'] as const,
  pendingRatings: () => ['me', 'pending-ratings'] as const,
  genres: () => ['onboarding', 'genres'] as const,
};

// ── Search and discovery ──────────────────────────────────

export function useArtistSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.search(query),
    enabled: query.trim().length >= 2,
    queryFn: () =>
      request<ArtistSearchResult[]>(`/search/artists?q=${encodeURIComponent(query.trim())}`),
    staleTime: 60_000,
  });
}

export interface FeedParams {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  genres?: string[];
  timezone?: string;
}

export function useDiscoveryFeed(params: FeedParams) {
  const search = new URLSearchParams();
  if (params.lat !== undefined) search.set('lat', String(params.lat));
  if (params.lng !== undefined) search.set('lng', String(params.lng));
  if (params.radiusKm) search.set('radiusKm', String(params.radiusKm));
  if (params.genres?.length) search.set('genres', params.genres.join(','));
  if (params.timezone) search.set('timezone', params.timezone);

  return useQuery({
    queryKey: queryKeys.feed(params.lat, params.lng, params.radiusKm, params.genres),
    queryFn: () =>
      request<DiscoveryFeed>(`/feed?${search.toString()}`, {
        cache: { key: `feed:${search.toString()}`, ttlSeconds: 900 },
      }),
    staleTime: 120_000,
  });
}

// ── Artists ───────────────────────────────────────────────

export function useArtist(idOrSlug: string) {
  return useQuery({
    queryKey: queryKeys.artist(idOrSlug),
    queryFn: () =>
      request<Artist & { viewerIsFollowing: boolean }>(`/artists/${idOrSlug}`, {
        cache: { key: `artist:${idOrSlug}`, ttlSeconds: 3600 },
      }),
  });
}

export function useArtistEvents(artistId: string, scope: 'upcoming' | 'past') {
  return useQuery({
    queryKey: queryKeys.artistEvents(artistId, scope),
    enabled: Boolean(artistId),
    queryFn: () =>
      request<Paginated<EventSummary>>(`/artists/${artistId}/events?scope=${scope}`, {
        cache: { key: `artist-events:${artistId}:${scope}`, ttlSeconds: 1800 },
      }),
  });
}

export function useSimilarArtists(artistId: string) {
  return useQuery({
    queryKey: queryKeys.similar(artistId),
    enabled: Boolean(artistId),
    queryFn: () => request<ArtistSummary[]>(`/artists/${artistId}/similar`),
    staleTime: 900_000,
  });
}

export function useFollowArtist(artistId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) =>
      request<{ following: boolean; followerCount: number }>(`/artists/${artistId}/follow`, {
        method: follow ? 'POST' : 'DELETE',
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.artist(artistId) });
      void client.invalidateQueries({ queryKey: queryKeys.following() });
    },
  });
}

// ── Events ────────────────────────────────────────────────

export function useEvent(idOrSlug: string) {
  return useQuery({
    queryKey: queryKeys.event(idOrSlug),
    queryFn: () =>
      request<EventDetail>(`/events/${idOrSlug}`, {
        cache: { key: `event:${idOrSlug}`, ttlSeconds: 3600 },
      }),
  });
}

export interface TravelOptions {
  venue: { id: string; name: string; addressLine: string | null; lat: number; lng: number };
  directions: {
    google: { app: string; web: string };
    apple: { app: string; web: string };
  };
  rides: {
    bolt: { app: string; web: string };
    uber: { app: string; web: string };
  };
  disclaimer: string;
}

export function useTravelOptions(eventId: string) {
  return useQuery({
    queryKey: queryKeys.travel(eventId),
    enabled: Boolean(eventId),
    queryFn: () =>
      request<TravelOptions>(`/events/${eventId}/travel`, {
        cache: { key: `travel:${eventId}`, ttlSeconds: 86_400 },
      }),
  });
}

export interface GroupPlans {
  connectionsGoing: {
    id: string;
    handle: string;
    displayName: string;
    avatar: string | null;
    state: string;
    mutual: boolean;
  }[];
  totalGoing: number;
  totalInterested: number;
}

export function useGroupPlans(eventId: string) {
  return useQuery({
    queryKey: queryKeys.going(eventId),
    enabled: Boolean(eventId),
    queryFn: () => request<GroupPlans>(`/events/${eventId}/going`),
  });
}

export function useSetAttendance(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (state: 'interested' | 'going' | null) =>
      state === null
        ? request(`/events/${eventId}/attendance`, { method: 'DELETE' })
        : request(`/events/${eventId}/attendance`, { method: 'PUT', body: { state } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      void client.invalidateQueries({ queryKey: queryKeys.going(eventId) });
      void client.invalidateQueries({ queryKey: queryKeys.plans() });
    },
  });
}

/**
 * Opens a ticket provider.
 *
 * The click is recorded server-side for affiliate attribution and the tagged URL
 * comes back; the checkout itself happens entirely on the provider's site.
 */
export function useTicketLink(eventId: string) {
  return useMutation({
    mutationFn: (optionId: string) =>
      request<{ url: string; clickId: string }>(`/events/${eventId}/tickets/${optionId}/click`, {
        method: 'POST',
        body: { surface: 'app' },
      }),
  });
}

// ── Thread ────────────────────────────────────────────────

export interface ThreadResponse {
  items: ThreadComment[];
  nextCursor: string | null;
  notice: string;
  thread: CommentThread;
  locked: boolean;
  unlocksAt: string | null;
}

export function useThread(
  eventId: string,
  options: { thread: CommentThread; tag?: CommentTag; sort: CommentSort },
) {
  const search = new URLSearchParams({ sort: options.sort, thread: options.thread });
  if (options.tag && options.tag !== 'none') search.set('tag', options.tag);

  return useQuery({
    queryKey: queryKeys.thread(eventId, options.thread, options.tag ?? 'all', options.sort),
    enabled: Boolean(eventId),
    queryFn: () => request<ThreadResponse>(`/events/${eventId}/comments?${search.toString()}`),
  });
}

export function usePostComment(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      body: string;
      tag: CommentTag;
      thread: CommentThread;
      parentCommentId?: string;
    }) => request<ThreadComment>(`/events/${eventId}/comments`, { method: 'POST', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['event', eventId, 'thread'] });
      void client.invalidateQueries({ queryKey: queryKeys.event(eventId) });
    },
  });
}

export function useLikeComment(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, liked }: { commentId: string; liked: boolean }) =>
      request(`/comments/${commentId}/like`, { method: liked ? 'DELETE' : 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['event', eventId, 'thread'] });
    },
  });
}

export function useReportComment() {
  return useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason: string }) =>
      request<{ message: string }>(`/comments/${commentId}/report`, {
        method: 'POST',
        body: { reason },
      }),
  });
}

// ── Ratings ───────────────────────────────────────────────

export function useRateArtist(artistId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { score: number; reviewText?: string }) =>
      request(`/artists/${artistId}/rating`, { method: 'PUT', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.artist(artistId) });
    },
  });
}

export function useRateLivePerformance(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { score: number; reviewText?: string }) =>
      request(`/events/${eventId}/rating`, { method: 'PUT', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.pendingRatings() });
    },
  });
}

export function usePendingRatings() {
  return useQuery({
    queryKey: queryKeys.pendingRatings(),
    queryFn: () => request<EventSummary[]>('/me/pending-ratings'),
  });
}

// ── Profile ───────────────────────────────────────────────

export interface Me {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  avatar: string | null;
  homeCity: string | null;
  homeLat: number | null;
  homeLng: number | null;
  locale: string;
  onboardedAt: string | null;
  onboardingGenres: string[];
  deletionRequestedAt: string | null;
  isAdmin: boolean;
  notificationPrefs: Record<string, boolean | number>;
  counts: { following: number; going: number; ratings: number };
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me(),
    enabled,
    retry: false,
    queryFn: () => request<Me>('/me'),
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      request<Me>('/me', { method: 'PATCH', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function useFollowing() {
  return useQuery({
    queryKey: queryKeys.following(),
    queryFn: () => request<ArtistSummary[]>('/me/following'),
  });
}

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.plans(),
    queryFn: () => request<{ state: string; event: EventSummary }[]>('/me/plans'),
  });
}

export function useBadges() {
  return useQuery({
    queryKey: queryKeys.badges(),
    queryFn: () =>
      request<{
        streakMonths: number;
        badges: { code: string; label: string; awardedAt: string }[];
        newlyAwarded: string[];
      }>('/me/badges'),
  });
}

export function useReferralCode() {
  return useQuery({
    queryKey: queryKeys.referral(),
    queryFn: () =>
      request<{ code: string; invites: number; completed: number }>('/me/referral-code'),
  });
}

export function useOnboardingGenres() {
  return useQuery({
    queryKey: queryKeys.genres(),
    queryFn: () => request<{ genre: string; artists: number }[]>('/me/onboarding/genres'),
  });
}

export function useCompleteOnboarding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { genres: string[]; artistIds: string[]; locale?: string }) =>
      request<Me>('/me/onboarding', { method: 'POST', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.me() });
      void client.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

// ── Privacy ───────────────────────────────────────────────

export interface ConsentState {
  type: string;
  label: string;
  granted: boolean;
  grantedAt: string | null;
  policyVersion: string | null;
  stale: boolean;
}

export function useConsents() {
  return useQuery({
    queryKey: queryKeys.consents(),
    queryFn: () => request<ConsentState[]>('/me/consents'),
  });
}

export function useRecordConsent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      entries: { type: string; granted: boolean }[];
      source?: string;
    }) => request<ConsentState[]>('/me/consents', { method: 'POST', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.consents() });
      void client.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function useRequestDeletion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cancel: boolean) =>
      request<{ requestedAt?: string; message?: string; cancelled?: boolean }>(
        '/me/deletion-request',
        { method: cancel ? 'DELETE' : 'POST' },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
