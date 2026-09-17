import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();

  const items = [
    { href: '/settings/notifications', label: t('profile.notifications') },
    { href: '/settings/language', label: t('profile.language') },
    { href: '/settings/privacy', label: t('profile.privacy') },
  ];

  return (
    <Screen>
      <ScrollView>
        {items.map((item) => (
          <Link key={item.href} href={item.href as never} asChild>
            <Pressable
              accessibilityRole="link"
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  label: { ...typography.body, color: colors.text },
  chevron: { color: colors.textFaint, fontSize: 22 },
});
