import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Artist, SocialPlatform, StreamingPlatform } from '@onstage/shared';
import { useArtist, useUpdateArtistProfile } from '../../../src/api/hooks';
import { BrandIcon } from '../../../src/components/brand';
import { Button, EmptyState, ErrorState, Loading, Screen } from '../../../src/components/ui';
import { colors, radii, spacing, typography } from '../../../src/theme';

const BIO_MAX = 2000;

const STREAMING: { platform: StreamingPlatform; label: string }[] = [
  { platform: 'spotify', label: 'Spotify' },
  { platform: 'apple_music', label: 'Apple Music' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'audiomack', label: 'Audiomack' },
  { platform: 'soundcloud', label: 'SoundCloud' },
];

const SOCIAL: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'x', label: 'X' },
  { platform: 'facebook', label: 'Facebook' },
];

/** Drops empty fields and adds the scheme people leave off; the API rejects the rest. */
function toLinkMap<K extends string>(
  values: Partial<Record<K, string>>,
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const [key, raw] of Object.entries(values) as [K, string | undefined][]) {
    const url = raw?.trim();
    if (url) out[key] = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
  return out;
}

/**
 * Self-service profile editing for a verified manager. Name, genres and photos
 * stay with Onstage operators; this is the copy and the links fans tap.
 */
export default function EditArtistScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const artist = useArtist(String(slug));

  if (artist.isLoading) return <Loading />;
  if (artist.isError || !artist.data) {
    return (
      <Screen>
        <ErrorState
          message={(artist.error as Error)?.message ?? 'Artist not found.'}
          onRetry={() => void artist.refetch()}
        />
      </Screen>
    );
  }

  if (!artist.data.viewerManages) {
    return (
      <Screen>
        <EmptyState
          title={t('artistEdit.notAllowedTitle')}
          body={t('artistEdit.notAllowedBody', { name: artist.data.name })}
        />
      </Screen>
    );
  }

  return <EditForm artist={artist.data} />;
}

/** Split out so the form state initialises once, from loaded data. */
function EditForm({ artist }: { artist: Artist }) {
  const { t } = useTranslation();
  const router = useRouter();
  const update = useUpdateArtistProfile(artist.id, artist.slug);

  const [bio, setBio] = useState(artist.bio ?? '');
  const [homeCity, setHomeCity] = useState(artist.homeCity ?? '');
  const [streaming, setStreaming] = useState(artist.streamingLinks ?? {});
  const [social, setSocial] = useState(artist.socialLinks ?? {});

  const save = () =>
    update.mutate(
      {
        bio: bio.trim() || null,
        homeCity: homeCity.trim() || null,
        streamingLinks: toLinkMap(streaming),
        socialLinks: toLinkMap(social),
      },
      { onSuccess: () => router.back() },
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('artistEdit.title')}</Text>

        <Text style={styles.label}>{t('artistEdit.bio')}</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder={t('artistEdit.bioPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={BIO_MAX}
          accessibilityLabel={t('artistEdit.bio')}
        />

        <Text style={styles.label}>{t('artistEdit.homeCity')}</Text>
        <TextInput
          value={homeCity}
          onChangeText={setHomeCity}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          maxLength={120}
          accessibilityLabel={t('artistEdit.homeCity')}
        />

        <Text style={styles.section}>{t('artistEdit.streaming')}</Text>
        {STREAMING.map(({ platform, label }) => (
          <LinkField
            key={platform}
            brand={platform}
            label={label}
            value={streaming[platform] ?? ''}
            placeholder={t('artistEdit.linkPlaceholder')}
            onChange={(value) => setStreaming((links) => ({ ...links, [platform]: value }))}
          />
        ))}

        <Text style={styles.section}>{t('artistEdit.social')}</Text>
        {SOCIAL.map(({ platform, label }) => (
          <LinkField
            key={platform}
            label={label}
            value={social[platform] ?? ''}
            placeholder={t('artistEdit.linkPlaceholder')}
            onChange={(value) => setSocial((links) => ({ ...links, [platform]: value }))}
          />
        ))}

        {update.isError ? (
          <Text style={styles.error}>{(update.error as Error).message}</Text>
        ) : null}

        <Button label={t('artistEdit.save')} onPress={save} loading={update.isPending} />
        <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

function LinkField({
  brand,
  label,
  value,
  placeholder,
  onChange,
}: {
  brand?: StreamingPlatform;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.linkRow}>
      <View style={styles.linkLabel}>
        {brand ? <BrandIcon brand={brand} size={18} /> : null}
        <Text style={styles.linkLabelText}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, { flex: 1 }]}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...typography.title, color: colors.text },
  label: { ...typography.label, color: colors.text, marginTop: spacing.sm },
  section: { ...typography.heading, color: colors.text, marginTop: spacing.lg },
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
  multiline: { minHeight: 140, paddingTop: spacing.md, textAlignVertical: 'top' },
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
