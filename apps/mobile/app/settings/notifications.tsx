import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DEFAULT_NOTIFICATION_PREFS } from '@onstage/shared';
import { useMe, useUpdateProfile } from '../../src/api/hooks';
import { Chip, ChipRow, Loading, Screen } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/theme';

/** Lead-time options for the on-sale reminder, in hours. */
const LEAD_TIMES = [1, 6, 24, 48];

const TOGGLES = [
  'newEventAnnounced',
  'onSaleReminder',
  'priceDrop',
  'ticketsBack',
  'weekendDigest',
  'postShowRating',
  'threadReplies',
  'email',
] as const;

/**
 * Notification preferences.
 *
 * Every category is switchable on its own, and the on-sale lead time is the
 * user's choice rather than ours — someone who wants a day's warning and
 * someone who wants an hour are both right about their own calendar.
 */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const update = useUpdateProfile();

  if (me.isLoading) return <Loading />;

  const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(me.data?.notificationPrefs ?? {}) };

  const setPref = (key: string, value: boolean | number) =>
    update.mutate({ notificationPrefs: { [key]: value } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {TOGGLES.map((key) => (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{t(`notifications.${key}`)}</Text>
            <Switch
              value={prefs[key] !== false}
              onValueChange={(value) => setPref(key, value)}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t(`notifications.${key}`)}
            />
          </View>
        ))}

        {prefs.onSaleReminder !== false ? (
          <View style={styles.leadTime}>
            <Text style={styles.leadLabel}>
              {t('notifications.onSaleLeadTime', { hours: prefs.onSaleLeadTimeHours })}
            </Text>
            <ChipRow>
              {LEAD_TIMES.map((hours) => (
                <Chip
                  key={hours}
                  label={`${hours}h`}
                  selected={prefs.onSaleLeadTimeHours === hours}
                  onPress={() => setPref('onSaleLeadTimeHours', hours)}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: { ...typography.body, color: colors.text, flex: 1 },
  leadTime: { paddingTop: spacing.lg },
  leadLabel: { ...typography.label, color: colors.textFaint, paddingHorizontal: spacing.lg },
});
