import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  LIVESTREAM_PLATFORM_LABELS,
  LIVESTREAM_PLATFORMS,
  type EventDetail,
  type LivestreamLinks,
} from '@onstage/shared';
import { useEvent, useSetLivestreams } from '../../../src/api/hooks';
import { BrandIcon } from '../../../src/components/brand';
import { Button, EmptyState, ErrorState, Loading, Screen } from '../../../src/components/ui';
import { colors, radii, spacing, typography } from '../../../src/theme';

/** Drops empty fields and adds the scheme people leave off; the API rejects the rest. */
function toLinkMap(values: LivestreamLinks): LivestreamLinks {
  const out: LivestreamLinks = {};
  for (const platform of LIVESTREAM_PLATFORMS) {
    const url = values[platform]?.trim();
    if (url) out[platform] = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
  return out;
}

/** Where the headliner's team says the show is streamed. */
export default function EditLivestreamsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const event = useEvent(String(slug));

  if (event.isLoading) return <Loading />;
  if (event.isError || !event.data) {
    return (
      <Screen>
        <ErrorState
          message={(event.error as Error)?.message ?? 'Event not found.'}
          onRetry={() => void event.refetch()}
        />
      </Screen>
    );
  }

  if (!event.data.viewerManages) {
    return (
      <Screen>
        <EmptyState
          title={t('livestreamEdit.notAllowedTitle')}
          body={t('livestreamEdit.notAllowedBody')}
        />
      </Screen>
    );
  }

  return <LivestreamForm event={event.data} />;
}

/** Split out so the form state initialises once, from loaded data. */
function LivestreamForm({ event }: { event: EventDetail }) {
  const { t } = useTranslation();
  const router = useRouter();
  const save = useSetLivestreams(event.id, event.slug);
  const [links, setLinks] = useState<LivestreamLinks>(event.livestreamLinks ?? {});

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('livestreamEdit.title')}</Text>
        <Text style={styles.body}>{t('livestreamEdit.body')}</Text>
        <Text style={styles.event}>{event.title}</Text>

        {LIVESTREAM_PLATFORMS.map((platform) => (
          <View key={platform} style={styles.linkRow}>
            <View style={styles.linkLabel}>
              <BrandIcon brand={platform} size={18} />
              <Text style={styles.linkLabelText}>{LIVESTREAM_PLATFORM_LABELS[platform]}</Text>
            </View>
            <TextInput
              value={links[platform] ?? ''}
              onChangeText={(value) => setLinks((current) => ({ ...current, [platform]: value }))}
              placeholder={t('artistEdit.linkPlaceholder')}
              placeholderTextColor={colors.textFaint}
              style={[styles.input, { flex: 1 }]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel={LIVESTREAM_PLATFORM_LABELS[platform]}
            />
          </View>
        ))}

        {save.isError ? <Text style={styles.error}>{(save.error as Error).message}</Text> : null}

        <Button
          label={t('livestreamEdit.save')}
          loading={save.isPending}
          onPress={() => save.mutate(toLinkMap(links), { onSuccess: () => router.back() })}
        />
        <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
  event: { ...typography.heading, color: colors.text, marginTop: spacing.sm },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkLabel: { width: 120, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkLabelText: { ...typography.label, color: colors.textMuted },
  error: {
    ...typography.caption,
    color: colors.statusCancelled,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
});
