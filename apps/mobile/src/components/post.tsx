import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatEventDateTime, publicEventUrl, shareUrl, type EventSummary } from '@onstage/shared';
import { ApiError } from '../api/client';
import { useSetAttendance } from '../api/hooks';
import { currentLocale } from '../i18n';
import { colors, spacing, typography } from '../theme';
import { Icon } from './icon';
import { Avatar, PromotedBadge, StatusBadge } from './ui';

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://onstage.co.za';
const DOUBLE_TAP_MS = 260;

/**
 * A gig as a feed post: who, the poster edge to edge, then one row of actions.
 *
 * The poster is the point — people decide on a gig from its artwork long before
 * they read the details, so it gets the full width. Double-tapping it saves the
 * gig (Interested), which is the cheapest possible way to say "maybe".
 */
export function EventPost({
  event,
  saved,
  reason,
}: {
  event: EventSummary;
  /** The viewer already marked this gig Interested or Going. */
  saved: boolean;
  /** Why it is in the feed: "12 km away", "You follow …". */
  reason?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const attendance = useSetAttendance(event.id, event.slug);

  // Optimistic: the heart fills on tap, not after the round trip.
  const [liked, setLiked] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setLiked(saved);
  }
  const interested = event.interestedCount + (liked && !saved ? 1 : !liked && saved ? -1 : 0);

  const burst = useState(() => new Animated.Value(0))[0];
  const lastTap = useRef(0);
  const singleTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (singleTap.current) clearTimeout(singleTap.current);
    },
    [],
  );

  const save = (value: boolean) => {
    setLiked(value);
    attendance.mutate(value ? 'interested' : null, {
      onError: (error) => {
        setLiked(!value);
        // Saving needs an account; send people to get one instead of failing quietly.
        if (error instanceof ApiError && error.status === 401) router.push('/auth/sign-in');
      },
    });
  };

  const openEvent = () => router.push(`/event/${event.slug}`);

  const onPosterPress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (singleTap.current) clearTimeout(singleTap.current);
      lastTap.current = 0;
      if (!liked) save(true);
      burst.setValue(0);
      Animated.sequence([
        Animated.spring(burst, { toValue: 1, useNativeDriver: true, friction: 4 }),
        Animated.timing(burst, { toValue: 0, duration: 250, delay: 300, useNativeDriver: true }),
      ]).start();
      return;
    }
    lastTap.current = now;
    singleTap.current = setTimeout(openEvent, DOUBLE_TAP_MS);
  };

  const onShare = () =>
    void Share.share({
      message: shareUrl(publicEventUrl(WEB_BASE, event.slug), 'app'),
      title: t('share.shareEvent'),
    });

  return (
    <View style={styles.post}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={event.primaryArtist.name}
        onPress={() => router.push(`/artist/${event.primaryArtist.slug}`)}
      >
        <View style={styles.header}>
          <Avatar
            uri={event.primaryArtist.profileImage}
            size={34}
            label={event.primaryArtist.name}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.artist} numberOfLines={1}>
              {event.primaryArtist.name}
            </Text>
            <Text style={styles.reason} numberOfLines={1}>
              {reason ?? `${event.venue.name} · ${event.venue.city}`}
            </Text>
          </View>
          {event.isPromoted ? <PromotedBadge /> : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${event.title}, ${event.venue.name}`}
        accessibilityHint={t('feed.doubleTapHint')}
        onPress={onPosterPress}
      >
        <View style={styles.posterBox}>
          {event.posterImage ? (
            <>
              {/* The whole poster over a blurred copy of itself, never cropped. */}
              <Image
                source={{ uri: event.posterImage }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                blurRadius={30}
              />
              <Image
                source={{ uri: event.posterImage }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                transition={200}
                accessibilityIgnoresInvertColors
              />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.posterFallback]}>
              <Text style={styles.fallbackTitle} numberOfLines={3}>
                {event.title}
              </Text>
            </View>
          )}
          <View style={styles.badge}>
            <StatusBadge status={event.status} />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.burst,
              {
                opacity: burst,
                transform: [
                  { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                ],
              },
            ]}
          >
            <Icon name="heart-fill" size={96} color="#FFFFFF" />
          </Animated.View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('event.interested')}
          accessibilityState={{ selected: liked }}
          hitSlop={8}
          onPress={() => save(!liked)}
        >
          <Icon
            name={liked ? 'heart-fill' : 'heart'}
            size={26}
            color={liked ? colors.accent : colors.text}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('feed.openThread')}
          hitSlop={8}
          onPress={openEvent}
        >
          <Icon name="comment" size={25} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('share.share')}
          hitSlop={8}
          onPress={onShare}
        >
          <Icon name="share" size={24} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('event.getTickets')}
          hitSlop={8}
          onPress={openEvent}
        >
          <Icon name="ticket" size={25} />
        </Pressable>
      </View>

      <View style={styles.caption}>
        {interested > 0 || event.goingCount > 0 ? (
          <Text style={styles.proof}>
            {t('feed.socialProof', {
              interested: Math.max(0, interested),
              going: event.goingCount,
            })}
          </Text>
        ) : null}
        <Text style={styles.title} numberOfLines={2} onPress={openEvent}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatEventDateTime(event.startsAt, event.localTimezone, currentLocale())} ·{' '}
          {event.venue.name}
        </Text>
      </View>
    </View>
  );
}

/** Grey placeholder in the shape of a post, shown while the feed loads. */
export function PostSkeleton() {
  const pulse = useState(() => new Animated.Value(0.4))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.post, { opacity: pulse }]} accessibilityElementsHidden>
      <View style={styles.header}>
        <View style={[styles.block, { width: 34, height: 34, borderRadius: 17 }]} />
        <View style={{ gap: 6 }}>
          <View style={[styles.block, { width: 140, height: 12 }]} />
          <View style={[styles.block, { width: 90, height: 10 }]} />
        </View>
      </View>
      <View style={[styles.posterBox, styles.block]} />
      <View style={styles.caption}>
        <View style={[styles.block, { width: '70%', height: 14 }]} />
        <View style={[styles.block, { width: '45%', height: 12 }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  post: { marginBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  artist: { ...typography.label, color: colors.text },
  reason: { ...typography.caption, color: colors.textMuted },
  // 4:5, the shape gig posters and Instagram posts share.
  posterBox: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  posterFallback: {
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'flex-end',
    padding: spacing.xl,
  },
  fallbackTitle: { ...typography.display, color: colors.text },
  badge: { position: 'absolute', left: spacing.md, top: spacing.md },
  burst: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  caption: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: 2 },
  proof: { ...typography.label, color: colors.text },
  title: { ...typography.heading, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  block: { backgroundColor: colors.surfaceRaised, borderRadius: 6 },
});
