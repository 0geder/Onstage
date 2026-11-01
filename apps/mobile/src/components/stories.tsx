import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { EventSummary } from '@onstage/shared';
import { colors, spacing, typography } from '../theme';

/**
 * The stories rail: one circle per artist with a show coming up, opening a
 * full-screen, tap-through run of their posters.
 *
 * The ring means "new to you": it is bright until the story has been opened in
 * this session, then dims — the same cue that makes people clear the row.
 */

const seen = new Set<string>();
let queue: EventSummary[] = [];
let startAt = 0;

/** Hands the viewer its stories; screens can't pass a list through a URL. */
export function openStories(events: EventSummary[], index: number) {
  queue = events;
  startAt = index;
}

export function storyQueue(): { events: EventSummary[]; start: number } {
  return { events: queue, start: startAt };
}

export function markSeen(eventId: string) {
  seen.add(eventId);
}

/** One story per artist: their soonest show. */
export function storiesFrom(events: EventSummary[]): EventSummary[] {
  const byArtist = new Map<string, EventSummary>();
  for (const event of events) {
    const current = byArtist.get(event.primaryArtist.id);
    if (!current || event.startsAt < current.startsAt) byArtist.set(event.primaryArtist.id, event);
  }
  return [...byArtist.values()];
}

const SIZE = 68;

export function StoryRail({ events }: { events: EventSummary[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  // Re-render on return so opened stories show as seen.
  const [, setTick] = useState(0);

  if (events.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      accessibilityLabel={t('stories.rail')}
    >
      {events.map((event, index) => {
        const isNew = !seen.has(event.id);
        const image = event.primaryArtist.profileImage ?? event.posterImage;
        return (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            accessibilityLabel={t('stories.open', { name: event.primaryArtist.name })}
            onPress={() => {
              openStories(events, index);
              setTick((tick) => tick + 1);
              router.push('/stories' as never);
            }}
          >
            {({ pressed }) => (
              <View style={[styles.item, pressed && { opacity: 0.7 }]}>
                <View style={[styles.ring, { borderColor: isNew ? colors.accent : colors.border }]}>
                  {image ? (
                    <Image source={{ uri: image }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.fallback]}>
                      <Text style={styles.initial}>
                        {event.primaryArtist.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {event.primaryArtist.name}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
  item: { width: SIZE + 8, alignItems: 'center', gap: spacing.xs },
  ring: {
    width: SIZE + 8,
    height: SIZE + 8,
    borderRadius: (SIZE + 8) / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  fallback: {
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { ...typography.title, color: colors.textMuted },
  name: { ...typography.caption, color: colors.text, width: SIZE + 8, textAlign: 'center' },
});
