import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatEventDateTime, formatRelativeTime } from '@onstage/shared';
import { ApiError } from '../src/api/client';
import { usePlans, useSetAttendance } from '../src/api/hooks';
import { Icon } from '../src/components/icon';
import { markSeen, storyQueue } from '../src/components/stories';
import { Avatar, Button } from '../src/components/ui';
import { currentLocale } from '../src/i18n';
import { useWorkingImage } from '../src/lib/working-image';
import { colors, radii, spacing, typography } from '../src/theme';

/** How long each poster stays up before the next one. */
const STORY_MS = 6000;

/**
 * Full-screen, tap-through posters: right side for next, left for back, hold
 * to pause. It ends after the last artist instead of rolling into more, so the
 * run is something you finish rather than something that keeps you.
 */
export default function StoriesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [{ events, start }] = useState(storyQueue);
  const [index, setIndex] = useState(start);
  const progress = useState(() => new Animated.Value(0))[0];
  const image = useWorkingImage(
    events[index]?.posterImage,
    events[index]?.primaryArtist.profileImage,
  );

  const event = events[index];
  const plans = usePlans();
  const attendance = useSetAttendance(event?.id ?? '', event?.slug ?? '');
  const saved = plans.data?.some((plan) => plan.event.id === event?.id) ?? false;

  const next = () => (index + 1 < events.length ? setIndex(index + 1) : router.back());
  const previous = () => setIndex(Math.max(0, index - 1));

  // Runs the progress bar for the current poster, then moves on.
  useEffect(() => {
    if (!event) return;
    markSeen(event.id);
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    run.start(({ finished }) => {
      if (finished) next();
    });
    return () => run.stop();
    // next is rebuilt every render; the timer only restarts per poster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const pause = () => progress.stopAnimation();
  const resume = () =>
    progress.stopAnimation((value) => {
      Animated.timing(progress, {
        toValue: 1,
        duration: STORY_MS * (1 - value),
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) next();
      });
    });

  if (!event) return <Redirect href="/" />;

  return (
    <View style={styles.screen}>
      {image.uri ? (
        <>
          {/* Blurred fill behind, the whole poster in front: posters are every
              shape, and cropping one cuts off the date or the line-up. */}
          <Image
            source={{ uri: image.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={40}
          />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
          <Image
            source={{ uri: image.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={150}
            onError={image.onError}
          />
        </>
      ) : null}

      {/* Tap zones: a third for back, two thirds for next; hold anywhere to pause. */}
      <View style={styles.zones}>
        <Pressable style={{ flex: 1 }} onPress={previous} onLongPress={pause} onPressOut={resume} />
        <Pressable style={{ flex: 2 }} onPress={next} onLongPress={pause} onPressOut={resume} />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {events.map((item, i) => (
            <View key={item.id} style={styles.bar}>
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    width:
                      i < index
                        ? '100%'
                        : i === index
                          ? progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%'],
                            })
                          : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.header}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.replace(`/artist/${event.primaryArtist.slug}`)}
            style={styles.who}
          >
            <Avatar
              uri={event.primaryArtist.profileImage}
              size={36}
              label={event.primaryArtist.name}
            />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.artist} numberOfLines={1}>
                {event.primaryArtist.name}
              </Text>
              <Text style={styles.when} numberOfLines={1}>
                {formatRelativeTime(event.startsAt)}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={12}
            onPress={() => router.back()}
          >
            <Icon name="close" size={28} />
          </Pressable>
        </View>
      </View>

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}
        pointerEvents="box-none"
      >
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatEventDateTime(event.startsAt, event.localTimezone, currentLocale())} ·{' '}
          {event.venue.name}, {event.venue.city}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('event.interested')}
            accessibilityState={{ selected: saved }}
            onPress={() =>
              attendance.mutate(saved ? null : 'interested', {
                onError: (error) => {
                  if (error instanceof ApiError && error.status === 401)
                    router.push('/auth/sign-in');
                },
              })
            }
            style={styles.heart}
          >
            <Icon
              name={saved ? 'heart-fill' : 'heart'}
              size={28}
              color={saved ? colors.accent : colors.text}
            />
          </Pressable>
          <Button
            label={t('stories.viewGig')}
            icon={<Icon name="ticket" size={18} color={colors.onAccent} />}
            style={{ flex: 1 }}
            onPress={() => router.replace(`/event/${event.slug}`)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  dim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  zones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  bars: { flexDirection: 'row', gap: 4 },
  bar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  barFill: { height: 3, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  artist: { ...typography.label, color: '#FFFFFF' },
  when: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  title: { ...typography.title, color: '#FFFFFF' },
  meta: { ...typography.body, color: 'rgba(255,255,255,0.85)' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  heart: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
