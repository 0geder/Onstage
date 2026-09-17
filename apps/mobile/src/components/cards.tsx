import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  formatEventDateTime,
  formatFollowerCount,
  formatRating,
  type ArtistSearchResult,
  type ArtistSummary,
  type EventSummary,
} from '@onstage/shared';
import { colors, radii, spacing, typography } from '../theme';
import { Avatar, PromotedBadge, StatusBadge } from './ui';
import { currentLocale } from '../i18n';

/**
 * Event and artist cards.
 *
 * Both are links rather than buttons, because both are places. That matters for
 * screen readers and it is what makes the lineup discovery path work: every
 * artist name anywhere in the app goes to that artist.
 */

export function EventCard({ event }: { event: EventSummary }) {
  const { t } = useTranslation();

  return (
    <Link href={`/event/${event.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${event.title}, ${event.venue.name}`}
        style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
      >
        {event.posterImage ? (
          <Image
            source={{ uri: event.posterImage }}
            style={styles.poster}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.poster, styles.posterFallback]} />
        )}

        <View style={styles.eventBody}>
          <View style={styles.badgeRow}>
            <StatusBadge status={event.status} />
            {event.isPromoted ? <PromotedBadge /> : null}
          </View>

          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>

          <Text style={styles.eventMeta} numberOfLines={1}>
            {formatEventDateTime(event.startsAt, event.localTimezone, currentLocale())}
          </Text>

          <Text style={styles.eventMetaFaint} numberOfLines={1}>
            {event.venue.name}
            {event.distanceKm !== undefined
              ? ` · ${t('feed.distanceAway', { km: event.distanceKm })}`
              : ` · ${event.venue.city}`}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

/** Wider variant for the horizontal feed rails. */
export function EventTile({ event }: { event: EventSummary }) {
  const { t } = useTranslation();

  return (
    <Link href={`/event/${event.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${event.title}, ${event.venue.name}`}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      >
        {event.posterImage ? (
          <Image
            source={{ uri: event.posterImage }}
            style={styles.tilePoster}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.tilePoster, styles.posterFallback]} />
        )}

        <View style={styles.tileBody}>
          <View style={styles.badgeRow}>
            <StatusBadge status={event.status} />
            {event.isPromoted ? <PromotedBadge /> : null}
          </View>
          <Text style={styles.tileTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.eventMeta} numberOfLines={1}>
            {formatEventDateTime(event.startsAt, event.localTimezone, currentLocale())}
          </Text>
          <Text style={styles.eventMetaFaint} numberOfLines={1}>
            {event.venue.name}
            {event.distanceKm !== undefined
              ? ` · ${t('feed.distanceAway', { km: event.distanceKm })}`
              : ''}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

export function ArtistRow({ artist, subtitle }: { artist: ArtistSummary; subtitle?: string }) {
  const { t } = useTranslation();

  return (
    <Link href={`/artist/${artist.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={artist.name}
        style={({ pressed }) => [styles.artistRow, pressed && styles.pressed]}
      >
        <Avatar uri={artist.profileImage} size={52} label={artist.name} />

        <View style={styles.artistRowBody}>
          <View style={styles.nameRow}>
            <Text style={styles.artistName} numberOfLines={1}>
              {artist.name}
            </Text>
            {artist.verified ? (
              <Text
                style={styles.verified}
                accessibilityLabel={t('artist.verified')}
                accessibilityRole="image"
              >
                ✓
              </Text>
            ) : null}
            {artist.isPromoted ? <PromotedBadge /> : null}
          </View>

          <Text style={styles.artistMeta} numberOfLines={1}>
            {artist.genres.slice(0, 2).join(' · ') || (artist.homeCity ?? '')}
          </Text>

          <Text style={styles.artistMetaFaint} numberOfLines={1}>
            {subtitle ??
              `${t('artist.followers', { count: artist.followerCount })} · ${formatRating(
                artist.ratingAvg,
                artist.ratingCount,
              )}`}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

/** A search result: the artist plus the next show, so the result is actionable. */
export function SearchResultRow({ result }: { result: ArtistSearchResult }) {
  const { t } = useTranslation();
  const next = result.nextEvent;

  return (
    <ArtistRow
      artist={result.artist}
      subtitle={
        next
          ? t('search.nextShow', {
              title: `${next.venue.city}, ${formatEventDateTime(
                next.startsAt,
                next.localTimezone,
                currentLocale(),
              )}`,
            })
          : t('search.noUpcoming')
      }
    />
  );
}

export function ArtistTile({ artist }: { artist: ArtistSummary }) {
  return (
    <Link href={`/artist/${artist.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={artist.name}
        style={({ pressed }) => [styles.artistTile, pressed && styles.pressed]}
      >
        <Avatar uri={artist.profileImage} size={72} label={artist.name} />
        <Text style={styles.artistTileName} numberOfLines={2}>
          {artist.name}
        </Text>
        <Text style={styles.artistTileMeta} numberOfLines={1}>
          {formatFollowerCount(artist.followerCount)}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },

  eventCard: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  poster: { width: 76, height: 100, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised },
  posterFallback: { backgroundColor: colors.surfaceRaised },
  eventBody: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  eventTitle: { ...typography.heading, color: colors.text },
  eventMeta: { ...typography.caption, color: colors.textMuted },
  eventMetaFaint: { ...typography.caption, color: colors.textFaint },

  tile: { width: 240, gap: spacing.sm },
  tilePoster: { width: 240, height: 150, borderRadius: radii.md },
  tileBody: { gap: spacing.xs },
  tileTitle: { ...typography.heading, color: colors.text },

  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  artistRowBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  artistName: { ...typography.heading, color: colors.text, flexShrink: 1 },
  verified: { color: colors.statusOnSale, fontWeight: '700' },
  artistMeta: { ...typography.caption, color: colors.textMuted },
  artistMetaFaint: { ...typography.caption, color: colors.textFaint },

  artistTile: { width: 96, alignItems: 'center', gap: spacing.sm },
  artistTileName: { ...typography.caption, color: colors.text, textAlign: 'center' },
  artistTileMeta: { ...typography.caption, color: colors.textFaint },
});
