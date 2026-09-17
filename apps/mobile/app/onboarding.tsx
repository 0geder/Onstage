import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ArtistSummary } from '@onstage/shared';
import {
  useArtistSearch,
  useCompleteOnboarding,
  useOnboardingGenres,
  useRecordConsent,
} from '../src/api/hooks';
import { Avatar, Button, Chip, ChipRow, Loading, Screen } from '../src/components/ui';
import { requestLocation } from '../src/lib/location';
import { colors, radii, spacing, typography } from '../src/theme';

const MIN_FOLLOWS = 3;

/**
 * Onboarding.
 *
 * Three steps, in this order for a reason: pick genres, follow at least three
 * artists, then decide about location. The follow minimum exists so that Near
 * You and Following are never empty on first open — an empty first screen is
 * the fastest way to lose someone.
 *
 * Location is asked last and is genuinely optional, with a plain explanation of
 * what it is for. Consent is recorded either way.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<'genres' | 'artists' | 'location'>('genres');
  const [genres, setGenres] = useState<string[]>([]);
  const [selected, setSelected] = useState<ArtistSummary[]>([]);

  const genreOptions = useOnboardingGenres();
  // Suggestions follow the first genre picked, so the artist step is populated
  // with something plausible rather than an empty search box.
  const suggestions = useArtistSearch(genres[0] ?? '');
  const complete = useCompleteOnboarding();
  const consent = useRecordConsent();

  const toggleGenre = (genre: string) =>
    setGenres((current) =>
      current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre],
    );

  const toggleArtist = (artist: ArtistSummary) =>
    setSelected((current) =>
      current.some((item) => item.id === artist.id)
        ? current.filter((item) => item.id !== artist.id)
        : [...current, artist],
    );

  const finish = async (allowLocation: boolean) => {
    if (allowLocation) {
      const result = await requestLocation();
      consent.mutate({
        entries: [{ type: 'location', granted: result.status === 'granted' }],
        source: 'onboarding',
      });
    } else {
      consent.mutate({
        entries: [{ type: 'location', granted: false }],
        source: 'onboarding',
      });
    }

    complete.mutate(
      { genres, artistIds: selected.map((artist) => artist.id) },
      {
        onSuccess: () => router.replace('/'),
        onError: (error) => Alert.alert(t('common.appName'), (error as Error).message),
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {step === 'genres' ? (
          <>
            <Text style={styles.title}>{t('onboarding.welcome')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>

            <Text style={styles.stepTitle}>{t('onboarding.pickGenres')}</Text>
            {genreOptions.isLoading ? (
              <Loading />
            ) : (
              <View style={styles.genreGrid}>
                {genreOptions.data?.map((option) => (
                  <Chip
                    key={option.genre}
                    label={option.genre}
                    selected={genres.includes(option.genre)}
                    onPress={() => toggleGenre(option.genre)}
                  />
                ))}
              </View>
            )}

            <Button
              label={t('onboarding.continue')}
              onPress={() => setStep('artists')}
              disabled={genres.length === 0}
            />
          </>
        ) : null}

        {step === 'artists' ? (
          <>
            <Text style={styles.stepTitle}>
              {t('onboarding.pickArtists', { count: MIN_FOLLOWS })}
            </Text>
            <Text style={styles.subtitle}>{t('onboarding.pickArtistsHint')}</Text>

            <ChipRow>
              {genres.map((genre) => (
                <Chip key={genre} label={genre} selected onPress={() => undefined} />
              ))}
            </ChipRow>

            {suggestions.isLoading ? (
              <Loading />
            ) : (
              <View style={styles.artistList}>
                {suggestions.data?.map(({ artist }) => {
                  const picked = selected.some((item) => item.id === artist.id);
                  return (
                    <View key={artist.id} style={styles.artistRow}>
                      <Avatar uri={artist.profileImage} size={44} label={artist.name} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.artistName}>{artist.name}</Text>
                        <Text style={styles.artistMeta}>{artist.genres.slice(0, 2).join(' · ')}</Text>
                      </View>
                      <Button
                        label={picked ? t('artist.following') : t('artist.follow')}
                        variant={picked ? 'primary' : 'secondary'}
                        onPress={() => toggleArtist(artist)}
                      />
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={styles.counter}>
              {t('onboarding.followingCount', { count: selected.length, min: MIN_FOLLOWS })}
            </Text>

            <Button
              label={t('onboarding.continue')}
              onPress={() => setStep('location')}
              disabled={selected.length < MIN_FOLLOWS}
            />
          </>
        ) : null}

        {step === 'location' ? (
          <>
            <Text style={styles.stepTitle}>{t('onboarding.locationTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.locationBody')}</Text>

            <Button
              label={t('onboarding.allowLocation')}
              onPress={() => void finish(true)}
              loading={complete.isPending}
            />
            <Button
              label={t('onboarding.notNow')}
              variant="ghost"
              onPress={() => void finish(false)}
              disabled={complete.isPending}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  stepTitle: { ...typography.title, color: colors.text, marginTop: spacing.lg },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  artistList: { gap: spacing.md },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  artistName: { ...typography.heading, color: colors.text },
  artistMeta: { ...typography.caption, color: colors.textFaint },
  counter: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
