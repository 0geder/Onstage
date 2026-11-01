import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useBadges, useFollowing, useMe, usePlans, useReferralCode } from '../../src/api/hooks';
import { ApiError } from '../../src/api/client';
import { signOutUser } from '../../src/lib/auth';
import { ArtistTile } from '../../src/components/cards';
import {
  Avatar,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  SectionHeading,
} from '../../src/components/ui';
import { colors, radii, spacing, typography } from '../../src/theme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const me = useMe();
  const following = useFollowing();
  const badges = useBadges();
  const referral = useReferralCode();
  const plans = usePlans();
  const [copied, setCopied] = useState(false);

  if (me.isLoading) return <Loading />;

  // A server that can't be reached is not the same as being signed out:
  // telling a signed-in person to sign in again sends them round in circles.
  if (me.error instanceof ApiError && me.error.status !== 401) {
    return (
      <Screen>
        <ErrorState message={me.error.message} onRetry={() => void me.refetch()} />
      </Screen>
    );
  }

  // Signed out is a normal state, not an error: everything except following,
  // saving and posting works without an account.
  if (me.isError || !me.data) {
    return (
      <Screen>
        <EmptyState
          title={t('profile.signIn')}
          body={t('profile.signedOutBody')}
          action={
            <Button label={t('profile.signIn')} onPress={() => router.push('/auth/sign-in')} />
          }
        />
      </Screen>
    );
  }

  const data = me.data;

  const copyCode = async () => {
    if (!referral.data) return;
    await Clipboard.setStringAsync(referral.data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareCode = () => {
    if (!referral.data) return;
    void Share.share({
      message: `${t('profile.inviteBody')} ${referral.data.code}`,
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={styles.header}>
          <Avatar uri={data.avatar} size={72} label={data.displayName} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{data.displayName}</Text>
            <Text style={styles.handle}>@{data.handle}</Text>
            {data.homeCity ? <Text style={styles.city}>{data.homeCity}</Text> : null}
          </View>
        </View>

        <View style={styles.counts}>
          <Count label={t('profile.following')} value={data.counts.following} />
          <Count label={t('event.going')} value={data.counts.going} />
          <Count label={t('profile.ratings')} value={data.counts.ratings} />
        </View>

        {/* Your gigs as a poster grid: the profile reads as the shows you are
            into, the way a photo grid reads as someone's life. */}
        {(plans.data?.length ?? 0) > 0 ? (
          <View>
            <SectionHeading title={t('profile.yourGigs')} />
            <View style={styles.grid}>
              {plans.data?.map(({ event }) => (
                <Pressable
                  key={event.id}
                  accessibilityRole="link"
                  accessibilityLabel={event.title}
                  onPress={() => router.push(`/event/${event.slug}`)}
                  style={styles.gridCell}
                >
                  {event.posterImage ? (
                    <Image
                      source={{ uri: event.posterImage }}
                      style={styles.gridImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.gridImage, styles.gridFallback]}>
                      <Text style={styles.gridTitle} numberOfLines={3}>
                        {event.title}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {badges.data && badges.data.badges.length > 0 ? (
          <View>
            <SectionHeading title={t('profile.badges')} />
            <Text style={styles.streak}>
              {t('profile.streak', { count: badges.data.streakMonths })}
            </Text>
            <View style={styles.badgeRow}>
              {badges.data.badges.map((badge) => (
                <View key={badge.code} style={styles.badge}>
                  <Text style={styles.badgeLabel}>{badge.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <SectionHeading title={t('profile.inviteFriend')} />
        <View style={styles.inviteCard}>
          <Text style={styles.inviteBody}>{t('profile.inviteBody')}</Text>
          <Text style={styles.inviteCode} accessibilityLabel={referral.data?.code}>
            {referral.data?.code ?? '·····'}
          </Text>
          <View style={styles.inviteActions}>
            <Button
              label={copied ? t('profile.copied') : t('profile.copyCode')}
              variant="secondary"
              onPress={() => void copyCode()}
              style={{ flex: 1 }}
            />
            <Button label={t('share.share')} onPress={shareCode} style={{ flex: 1 }} />
          </View>
        </View>

        <SectionHeading
          title={t('profile.following')}
          action={
            (following.data?.length ?? 0) > 0 ? (
              <Text style={styles.count}>{following.data?.length}</Text>
            ) : null
          }
        />
        {(following.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('feed.emptyFollowing')} />
        ) : (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={following.data}
            keyExtractor={(artist) => artist.id}
            contentContainerStyle={styles.followingRow}
            renderItem={({ item }) => <ArtistTile artist={item} />}
          />
        )}

        <Divider />

        <SectionHeading title={t('profile.settings')} />
        <SettingsLink href="/settings/notifications" label={t('profile.notifications')} />
        <SettingsLink href="/settings/language" label={t('profile.language')} />
        <SettingsLink href="/settings/privacy" label={t('profile.privacy')} />

        <View style={styles.signOut}>
          <Button
            label={t('profile.signOut')}
            variant="ghost"
            // resetQueries, not clear: clear drops the cache without telling the
            // screens already showing it, so this one stayed signed in.
            onPress={() => void signOutUser().then(() => queryClient.resetQueries())}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countBlock}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable accessibilityRole="link">
        {({ pressed }) => (
          <View style={[styles.settingsRow, pressed && { opacity: 0.7 }]}>
            <Text style={styles.settingsLabel}>{label}</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  name: { ...typography.title, color: colors.text },
  handle: { ...typography.body, color: colors.textMuted },
  city: { ...typography.caption, color: colors.textFaint },

  counts: { flexDirection: 'row', paddingHorizontal: spacing.lg },
  countBlock: { flex: 1 },
  countValue: { ...typography.title, color: colors.text },
  countLabel: { ...typography.caption, color: colors.textFaint },
  count: { ...typography.caption, color: colors.textFaint },

  streak: { ...typography.body, color: colors.accent, paddingHorizontal: spacing.lg },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.promoted,
  },
  badgeLabel: { ...typography.caption, color: colors.promoted, fontWeight: '600' },

  inviteCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
    gap: spacing.md,
  },
  inviteBody: { ...typography.body, color: colors.textMuted },
  inviteCode: {
    ...typography.display,
    color: colors.text,
    letterSpacing: 4,
    textAlign: 'center',
  },
  inviteActions: { flexDirection: 'row', gap: spacing.sm },

  followingRow: { paddingHorizontal: spacing.lg, gap: spacing.lg },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  settingsLabel: { ...typography.body, color: colors.text },
  chevron: { color: colors.textFaint, fontSize: 22 },
  signOut: { padding: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  gridCell: { width: '33%', aspectRatio: 4 / 5 },
  gridImage: { width: '100%', height: '100%', backgroundColor: colors.surface },
  gridFallback: { justifyContent: 'flex-end', padding: spacing.sm },
  gridTitle: { ...typography.caption, color: colors.text },
});
