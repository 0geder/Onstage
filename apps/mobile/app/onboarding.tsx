import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ArtistSummary } from '@onstage/shared';
import {
  useArtistSearch,
  useCompleteOnboarding,
  useOnboardingArtists,
  useOnboardingGenres,
  useRecordConsent,
} from '../src/api/hooks';
import { Avatar, Button, Chip, ChipRow, Loading, Screen } from '../src/components/ui';
import { requestLocation } from '../src/lib/location';
import { enablePush } from '../src/lib/push';
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

  const [query, setQuery] = useState('');

  const genreOptions = useOnboardingGenres();
  // Artists with upcoming shows, so the step is never empty and every follow
  // puts a gig in the feed. Typing searches the whole catalogue instead.
  const suggested = useOnboardingArtists(genres);
  const search = useArtistSearch(query);
  const searching = query.trim().length >= 2;
  const candidates: ArtistSummary[] = searching
    ? (search.data ?? []).map((result) => result.artist)
    : (suggested.data ?? []);
  const loadingCandidates = searching ? search.isLoading : suggested.isLoading;
  // Picks stay listed even when a search hides them, so they can be undone.
  const listed = [
    ...selected.filter((artist) => !candidates.some((item) => item.id === artist.id)),
    ...candidates,
  ];
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

    // Following artists is the user asking to hear about their shows, so this
    // is the natural moment for the one OS permission prompt.
    const pushEnabled = await enablePush();
    consent.mutate({
      entries: [{ type: 'push_notifications', granted: pushEnabled }],
      source: 'onboarding',
    });

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
            ) : genreOptions.data?.length ? (
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
            ) : null}

            {/* Genres are optional: most of the catalogue has none yet, and a
                required step with nothing to pick would stop sign-up dead. */}
            <Button label={t('onboarding.continue')} onPress={() => setStep('artists')} />
          </>
        ) : null}

        {step === 'artists' ? (
          <>
            <Text style={styles.stepTitle}>
              {t('onboarding.pickArtists', { count: MIN_FOLLOWS })}
            </Text>
            <Text style={styles.subtitle}>{t('onboarding.pickArtistsHint')}</Text>

            {genres.length > 0 ? (
              <ChipRow>
                {genres.map((genre) => (
                  <Chip key={genre} label={genre} selected onPress={() => undefined} />
                ))}
              </ChipRow>
            ) : null}

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('onboarding.searchArtists')}
              placeholderTextColor={colors.textFaint}
              style={styles.search}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('onboarding.searchArtists')}
            />

            {loadingCandidates ? (
              <Loading />
            ) : (
              <View style={styles.artistList}>
                {listed.map((artist) => {
                  const picked = selected.some((item) => item.id === artist.id);
                  return (
                    <View key={artist.id} style={styles.artistRow}>
                      <Avatar uri={artist.profileImage} size={44} label={artist.name} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.artistName}>{artist.name}</Text>
                        <Text style={styles.artistMeta}>
                          {artist.genres.slice(0, 2).join(' · ') || (artist.homeCity ?? '')}
                        </Text>
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
  search: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
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
