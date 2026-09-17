import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  formatRating,
  publicArtistUrl,
  shareUrl,
  spotifyArtistLink,
  type StreamingPlatform,
} from '@onstage/shared';
import {
  useArtist,
  useArtistEvents,
  useFollowArtist,
  useSimilarArtists,
} from '../../src/api/hooks';
import { ArtistTile, EventCard } from '../../src/components/cards';
import {
  Avatar,
  Button,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Loading,
  PromotedBadge,
  Screen,
  SectionHeading,
} from '../../src/components/ui';
import { RatingSheet } from '../../src/components/rating-sheet';
import { colors, radii, spacing, typography } from '../../src/theme';

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://onstage.co.za';

/** Order matters: these are the platforms South African listeners actually use. */
const STREAMING_ORDER: StreamingPlatform[] = [
  'spotify',
  'apple_music',
  'youtube',
  'audiomack',
  'soundcloud',
];

const STREAMING_LABELS: Record<StreamingPlatform, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  audiomack: 'Audiomack',
};

export default function ArtistScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();

  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [rating, setRating] = useState(false);

  const artist = useArtist(String(slug));
  const artistId = artist.data?.id ?? '';
  const events = useArtistEvents(artistId, tab);
  const similar = useSimilarArtists(artistId);
  const follow = useFollowArtist(artistId);

  if (artist.isLoading) return <Loading />;
  if (artist.isError || !artist.data) {
    return (
      <Screen>
        <ErrorState
          message={(artist.error as Error)?.message ?? 'Artist not found.'}
          onRetry={() => void artist.refetch()}
        />
      </Screen>
    );
  }

  const data = artist.data;
  const streaming = data.streamingLinks ?? {};

  const openStreaming = async (platform: StreamingPlatform, url: string) => {
    // Spotify gets the app scheme first; the rest are plain https links that the
    // OS hands to the installed app when there is one.
    if (platform === 'spotify' && data.externalIds?.spotify_id) {
      const links = spotifyArtistLink(data.externalIds.spotify_id);
      if (await Linking.canOpenURL(links.app)) {
        await Linking.openURL(links.app);
        return;
      }
    }
    await WebBrowser.openBrowserAsync(url);
  };

  const onShare = () =>
    void Share.share({
      message: shareUrl(publicArtistUrl(WEB_BASE, data.slug), 'app'),
      title: t('share.shareArtist', { name: data.name }),
    });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {data.bannerImage ? (
          <Image source={{ uri: data.bannerImage }} style={styles.banner} contentFit="cover" />
        ) : (
          <View style={[styles.banner, { backgroundColor: colors.surfaceRaised }]} />
        )}

        <View style={styles.header}>
          <Avatar uri={data.profileImage} size={88} label={data.name} />

          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{data.name}</Text>
              {data.verified ? (
                <Text style={styles.verified} accessibilityLabel={t('artist.verified')}>
                  ✓
                </Text>
              ) : null}
            </View>
            {data.isPromoted ? <PromotedBadge /> : null}
            <Text style={styles.meta}>
              {[data.genres.slice(0, 3).join(' · '), data.homeCity].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {/* Overall and live ratings are shown apart, never averaged together —
            they answer different questions and merging them destroys the one
            number nobody else has. */}
        <View style={styles.stats}>
          <Stat
            label={t('artist.following')}
            value={data.followerCount.toLocaleString('en-ZA')}
          />
          <Stat
            label={t('artist.overallRating')}
            value={formatRating(data.ratingAvg, data.ratingCount)}
          />
          <Stat
            label={t('artist.liveRating')}
            value={formatRating(data.liveRatingAvg, data.liveRatingCount)}
          />
        </View>

        <View style={styles.actions}>
          <Button
            label={data.viewerIsFollowing ? t('artist.following') : t('artist.follow')}
            variant={data.viewerIsFollowing ? 'secondary' : 'primary'}
            loading={follow.isPending}
            onPress={() => follow.mutate(!data.viewerIsFollowing)}
            style={{ flex: 1 }}
          />
          <Button
            label={t('share.share')}
            variant="secondary"
            onPress={onShare}
            style={{ flex: 1 }}
          />
        </View>

        {data.bio ? <Text style={styles.bio}>{data.bio}</Text> : null}

        {/* Onstage hosts no audio. Every one of these is a hand-off. */}
        {Object.keys(streaming).length > 0 ? (
          <View>
            <SectionHeading title={t('artist.listen')} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.streamingRow}
            >
              {STREAMING_ORDER.filter((platform) => streaming[platform]).map((platform) => (
                <Pressable
                  key={platform}
                  accessibilityRole="link"
                  accessibilityLabel={`${STREAMING_LABELS[platform]}, ${data.name}`}
                  onPress={() => void openStreaming(platform, streaming[platform] as string)}
                  style={({ pressed }) => [styles.streamingButton, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.streamingLabel}>{STREAMING_LABELS[platform]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.tabs}>
          <Chip
            label={t('artist.upcoming')}
            selected={tab === 'upcoming'}
            onPress={() => setTab('upcoming')}
          />
          <Chip label={t('artist.past')} selected={tab === 'past'} onPress={() => setTab('past')} />
        </View>

        {events.isLoading ? (
          <Loading />
        ) : (events.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={tab === 'upcoming' ? t('artist.noUpcoming') : t('artist.noPast')} />
        ) : (
          events.data?.items.map((event) => <EventCard key={event.id} event={event} />)
        )}

        <Divider />

        <View style={styles.rateBlock}>
          <Button
            label={t('artist.rateThisArtist')}
            variant="secondary"
            onPress={() => setRating(true)}
          />
        </View>

        {(similar.data?.length ?? 0) > 0 ? (
          <View>
            <SectionHeading title={t('artist.similar')} />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={similar.data}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.similarRow}
              renderItem={({ item }) => <ArtistTile artist={item} />}
            />
          </View>
        ) : null}
      </ScrollView>

      <RatingSheet
        visible={rating}
        artistId={data.id}
        artistName={data.name}
        onClose={() => setRating(false)}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', height: 190 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: -34,
  },
  nameBlock: { flex: 1, gap: spacing.xs, paddingBottom: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.title, color: colors.text, flexShrink: 1 },
  verified: { color: colors.statusOnSale, fontSize: 16, fontWeight: '700' },
  meta: { ...typography.caption, color: colors.textMuted },

  stats: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  stat: { flex: 1, gap: 2 },
  statValue: { ...typography.heading, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textFaint },

  actions: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  bio: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    lineHeight: 22,
  },

  streamingRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  streamingButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streamingLabel: { ...typography.label, color: colors.text },

  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  rateBlock: { padding: spacing.lg },
  similarRow: { paddingHorizontal: spacing.lg, gap: spacing.lg },
});
