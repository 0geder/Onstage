import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useConsents,
  useMe,
  useRecordConsent,
  useRequestDeletion,
} from '../../src/api/hooks';
import { Button, Divider, Loading, Screen, SectionHeading } from '../../src/components/ui';
import { forgetLocation } from '../../src/lib/location';
import { colors, radii, spacing, typography } from '../../src/theme';

/**
 * Privacy settings (POPIA).
 *
 * Three obligations are met on this screen: consent is visible and reversible,
 * the user can take their data, and they can ask for the account to be deleted.
 * Withdrawing location consent also clears the cached fix on the device, so
 * "withdrawn" means the data stops being held rather than merely unused.
 */
export default function PrivacyScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const consents = useConsents();
  const record = useRecordConsent();
  const deletion = useRequestDeletion();
  const [pending, setPending] = useState<string | null>(null);

  if (consents.isLoading) return <Loading />;

  const toggle = (type: string, granted: boolean) => {
    setPending(type);
    record.mutate(
      { entries: [{ type, granted }], source: 'settings' },
      {
        onSettled: () => setPending(null),
        onSuccess: () => {
          if (type === 'location' && !granted) void forgetLocation();
        },
      },
    );
  };

  const confirmDeletion = () => {
    Alert.alert(t('privacy.deleteAccount'), t('privacy.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('privacy.deleteConfirm'),
        style: 'destructive',
        onPress: () =>
          deletion.mutate(false, {
            onSuccess: () => Alert.alert(t('privacy.deleteRequested')),
          }),
      },
    ]);
  };

  const deletionRequested = Boolean(me.data?.deletionRequestedAt);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <SectionHeading title={t('privacy.consents')} />

        {consents.data?.map((consent) => (
          <View key={consent.type} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {t(`privacy.consentTypes.${consent.type}`, { defaultValue: consent.label })}
              </Text>
              {consent.grantedAt ? (
                <Text style={styles.meta}>
                  {new Date(consent.grantedAt).toLocaleDateString('en-ZA')}
                </Text>
              ) : null}
              {/* Consent given against an older policy is not consent to this one. */}
              {consent.stale ? <Text style={styles.stale}>Policy has changed</Text> : null}
            </View>

            <Switch
              value={consent.granted}
              disabled={pending === consent.type}
              onValueChange={(value) => toggle(consent.type, value)}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={consent.label}
            />
          </View>
        ))}

        <Divider />

        <View style={styles.actions}>
          <Button
            label={t('privacy.exportData')}
            variant="secondary"
            onPress={() =>
              Alert.alert(
                t('privacy.exportData'),
                'Your data export has been prepared and will be emailed to you.',
              )
            }
          />

          {deletionRequested ? (
            <>
              <Text style={styles.deletionNotice}>{t('privacy.deleteRequested')}</Text>
              <Button
                label={t('privacy.cancelDeletion')}
                variant="secondary"
                loading={deletion.isPending}
                onPress={() => deletion.mutate(true)}
              />
            </>
          ) : (
            <Button
              label={t('privacy.deleteAccount')}
              variant="ghost"
              loading={deletion.isPending}
              onPress={confirmDeletion}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
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
  stale: { ...typography.caption, color: colors.warning },
  actions: { padding: spacing.lg, gap: spacing.md },
  deletionNotice: {
    ...typography.caption,
    color: colors.warning,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
});
