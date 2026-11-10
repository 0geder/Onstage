import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { request } from '../../src/api/client';
import {
  useConsents,
  useMe,
  useRecordConsent,
  useRequestDeletion,
} from '../../src/api/hooks';
import { Button, Divider, Loading, Screen, SectionHeading } from '../../src/components/ui';
import { forgetLocation } from '../../src/lib/location';
import { enablePush } from '../../src/lib/push';
import { colors, radii, spacing, typography } from '../../src/theme';

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://onstage.co.za';

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
  const [exporting, setExporting] = useState(false);

  if (consents.isLoading) return <Loading />;

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await request<unknown>('/me/data-export');
      const file = new File(Paths.cache, 'onstage-data-export.json');
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: t('privacy.exportData'),
          UTI: 'public.json',
        });
      }
    } catch (error) {
      Alert.alert(t('privacy.exportData'), (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const toggle = async (type: string, requested: boolean) => {
    setPending(type);
    let granted = requested;
    // Push consent only means something if the OS lets us deliver.
    if (type === 'push_notifications' && requested) {
      granted = await enablePush();
      if (!granted) Alert.alert(t('profile.notifications'), t('privacy.pushBlocked'));
    }
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
              onValueChange={(value) => void toggle(consent.type, value)}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={consent.label}
            />
          </View>
        ))}

        <Divider />

        {(['policy', 'terms'] as const).map((page) => (
          <Pressable
            key={page}
            accessibilityRole="link"
            style={styles.row}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${WEB_BASE}/${page === 'policy' ? 'privacy' : 'terms'}`)
            }
          >
            <Text style={[styles.label, { flex: 1 }]}>{t(`privacy.${page}`)}</Text>
            <Text style={styles.meta}>›</Text>
          </Pressable>
        ))}

        <Divider />

        <View style={styles.actions}>
          <Button
            label={t('privacy.exportData')}
            variant="secondary"
            loading={exporting}
            onPress={() => void exportData()}
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
