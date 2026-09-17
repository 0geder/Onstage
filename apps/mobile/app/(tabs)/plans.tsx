import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { EventSummary } from '@onstage/shared';
import { usePendingRatings, usePlans } from '../../src/api/hooks';
import { EventCard } from '../../src/components/cards';
import {
  Button,
  Divider,
  EmptyState,
  Loading,
  Screen,
  SectionHeading,
} from '../../src/components/ui';
import { RatingSheet } from '../../src/components/rating-sheet';
import { colors, spacing, typography } from '../../src/theme';

/**
 * Plans.
 *
 * What the user committed to, and — above it — the shows they attended but have
 * not rated yet. That prompt is the same one the morning-after push links into,
 * so someone who ignored the notification still finds it here.
 */
export default function PlansScreen() {
  const { t } = useTranslation();
  const plans = usePlans();
  const pending = usePendingRatings();
  const [rating, setRating] = useState<EventSummary | null>(null);

  if (plans.isLoading) return <Loading />;

  const upcoming = plans.data ?? [];
  const toRate = pending.data ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {toRate.length > 0 ? (
          <View>
            <SectionHeading title={t('rating.liveTitle')} />
            {toRate.map((event) => (
              <View key={event.id} style={styles.pendingCard}>
                <Text style={styles.pendingTitle}>{event.title}</Text>
                <Text style={styles.pendingMeta}>{event.venue.name}</Text>
                <Button
                  label={t('rating.submit')}
                  variant="secondary"
                  onPress={() => setRating(event)}
                />
              </View>
            ))}
            <Divider />
          </View>
        ) : null}

        <SectionHeading title={t('profile.plans')} />
        {upcoming.length === 0 ? (
          <EmptyState title={t('feed.emptyFollowing')} />
        ) : (
          upcoming.map(({ state, event }) => (
            <View key={event.id}>
              <Text style={styles.state}>
                {state === 'going' ? t('event.going') : t('event.interested')}
              </Text>
              <EventCard event={event} />
            </View>
          ))
        )}
      </ScrollView>

      <RatingSheet
        visible={rating !== null}
        eventId={rating?.id}
        eventTitle={rating?.title}
        artistId={rating?.primaryArtist.id}
        artistName={rating?.primaryArtist.name}
        onClose={() => setRating(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pendingCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
    gap: spacing.sm,
  },
  pendingTitle: { ...typography.heading, color: colors.text },
  pendingMeta: { ...typography.caption, color: colors.textMuted },
  state: {
    ...typography.caption,
    color: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    fontWeight: '600',
  },
});
