import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BlockedUser } from '@onstage/shared';
import { useBlockUser, useBlockedUsers } from '../api/hooks';
import { colors, spacing, typography } from '../theme';
import { Avatar, SectionHeading } from './ui';

/**
 * The people you have blocked, each with Unblock. Lives on the privacy screen;
 * blocking itself happens from a comment in an event thread.
 */
export function BlockedPeople() {
  const { t } = useTranslation();
  const blocked = useBlockedUsers();
  const block = useBlockUser();

  const confirmUnblock = (person: BlockedUser) => {
    Alert.alert(
      t('privacy.unblockTitle', { name: person.displayName }),
      t('privacy.unblockBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('privacy.unblock'),
          onPress: () =>
            block.mutate(
              { userId: person.id, blocked: false },
              { onError: (error) => Alert.alert(t('privacy.blocked'), (error as Error).message) },
            ),
        },
      ],
    );
  };

  const items = blocked.data?.items ?? [];

  return (
    <View>
      <SectionHeading title={t('privacy.blocked')} />

      {blocked.isLoading ? null : items.length === 0 ? (
        <Text style={styles.empty}>{t('privacy.blockedEmpty')}</Text>
      ) : (
        items.map((person) => (
          <View key={person.id} style={styles.row}>
            <Avatar uri={person.avatar} size={32} label={person.displayName} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{person.displayName}</Text>
              <Text style={styles.meta}>@{person.handle}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('privacy.unblock')} ${person.displayName}`}
              disabled={block.isPending}
              onPress={() => confirmUnblock(person)}
              hitSlop={8}
            >
              <Text style={styles.action}>{t('privacy.unblock')}</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: { ...typography.body, color: colors.text },
  meta: { ...typography.caption, color: colors.textFaint },
  action: { ...typography.label, color: colors.accent },
  empty: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
