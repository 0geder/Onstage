import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useBadges, useFollowing, useMe, useReferralCode } from '../../src/api/hooks';
import { signOutUser } from '../../src/lib/auth';
import { ArtistTile } from '../../src/components/cards';
import {
  Avatar,
  Button,
  Divider,
  EmptyState,
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
  const [copied, setCopied] = useState(false);

  if (me.isLoading) return <Loading />;

  // Signed out is a normal state, not an error: everything except following,
  // saving and posting works without an account.
  if (me.isError || !me.data) {
    return (
      <Screen>
        <EmptyState
          title={t('profile.signIn')}
          body={t('profile.signedOutBody')}
          action={<Button label={t('profile.signIn')} onPress={() => router.push('/auth/sign-in')} />}
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
            onPress={() => void signOutUser().then(() => queryClient.clear())}
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
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [styles.settingsRow, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.settingsLabel}>{label}</Text>
        <Text style={styles.chevron}>›</Text>
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
});
