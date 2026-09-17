import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@onstage/shared';
import { useUpdateProfile } from '../../src/api/hooks';
import { Screen } from '../../src/components/ui';
import { currentLocale, setLocale } from '../../src/i18n';
import { colors, spacing, typography } from '../../src/theme';

/**
 * Language.
 *
 * Changing it switches the interface immediately and saves the choice against
 * the account, so notifications arrive in the same language as the app.
 */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const active = currentLocale();

  const choose = async (locale: Locale) => {
    await setLocale(locale);
    // Best-effort: a signed-out user still gets the interface change.
    update.mutate({ locale });
  };

  return (
    <Screen>
      <ScrollView>
        {SUPPORTED_LOCALES.map((locale) => (
          <Pressable
            key={locale}
            accessibilityRole="radio"
            accessibilityState={{ selected: active === locale }}
            onPress={() => void choose(locale)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{LOCALE_LABELS[locale]}</Text>
            </View>
            {active === locale ? <Text style={styles.tick}>✓</Text> : null}
          </Pressable>
        ))}

        <Text style={styles.note}>{t('profile.language')}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  label: { ...typography.body, color: colors.text },
  tick: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  note: { ...typography.caption, color: colors.textFaint, padding: spacing.lg },
});
