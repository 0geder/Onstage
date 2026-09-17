import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventSummary, GeoPoint } from '@onstage/shared';
import { useDiscoveryFeed, useOnboardingGenres } from '../../src/api/hooks';
import { EventCard, EventTile } from '../../src/components/cards';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  SectionHeading,
} from '../../src/components/ui';
import {
  CITY_CENTRES,
  currentPermission,
  lastKnownLocation,
  requestLocation,
} from '../../src/lib/location';
import { colors, spacing, typography } from '../../src/theme';

const RADIUS_OPTIONS = [10, 25, 50, 100];

/**
 * Discovery feed.
 *
 * Three sections from the spec. The important behaviour is what happens when a
 * section cannot be built: no location shows a city picker rather than an error,
 * and an empty section says so rather than vanishing, so the screen never looks
 * broken when it is merely empty.
 */
export default function DiscoverScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [centre, setCentre] = useState<GeoPoint | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [genres, setGenres] = useState<string[]>([]);
  const [locationAsked, setLocationAsked] = useState(false);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Africa/Johannesburg',
    [],
  );

  // Use an existing permission silently; never prompt on first paint.
  useEffect(() => {
    void (async () => {
      const cached = await lastKnownLocation();
      if (cached) setCentre(cached);

      if ((await currentPermission()) === 'granted') {
        const result = await requestLocation();
        if (result.status === 'granted') setCentre(result.point);
        setLocationAsked(true);
      }
    })();
  }, []);

  const feed = useDiscoveryFeed({
    lat: centre?.lat,
    lng: centre?.lng,
    radiusKm,
    genres,
    timezone,
  });
  const genreOptions = useOnboardingGenres();

  const askForLocation = async () => {
    setLocationAsked(true);
    const result = await requestLocation();
    if (result.status === 'granted') {
      setCentre(result.point);
      setCityName(null);
    }
  };

  const toggleGenre = (genre: string) =>
    setGenres((current) =>
      current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre],
    );

  if (feed.isLoading && !feed.data) return <Loading />;
  if (feed.isError && !feed.data) {
    return (
      <Screen>
        <ErrorState message={(feed.error as Error).message} onRetry={() => void feed.refetch()} />
      </Screen>
    );
  }

  const data = feed.data;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching}
            onRefresh={() => void feed.refetch()}
            tintColor={colors.textMuted}
          />
        }
      >
        {!centre ? (
          <View style={styles.locationPrompt}>
            <Text style={styles.promptTitle}>{t('feed.enableLocation')}</Text>
            <Text style={styles.promptBody}>{t('feed.locationRationale')}</Text>
            <Button label={t('feed.enableLocation')} onPress={() => void askForLocation()} />

            <Text style={styles.orPickCity}>{t('profile.homeLocation')}</Text>
            <ChipRow>
              {CITY_CENTRES.map((city) => (
                <Chip
                  key={city.name}
                  label={city.name}
                  selected={cityName === city.name}
                  onPress={() => {
                    setCentre(city.point);
                    setCityName(city.name);
                  }}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}

        {centre ? (
          <>
            <ChipRow>
              {RADIUS_OPTIONS.map((km) => (
                <Chip
                  key={km}
                  label={t('feed.radius', { km })}
                  selected={radiusKm === km}
                  onPress={() => setRadiusKm(km)}
                />
              ))}
            </ChipRow>

            {genreOptions.data?.length ? (
              <ChipRow>
                <Chip
                  label={t('feed.allGenres')}
                  selected={genres.length === 0}
                  onPress={() => setGenres([])}
                />
                {genreOptions.data.slice(0, 12).map((option) => (
                  <Chip
                    key={option.genre}
                    label={option.genre}
                    selected={genres.includes(option.genre)}
                    onPress={() => toggleGenre(option.genre)}
                  />
                ))}
              </ChipRow>
            ) : null}
          </>
        ) : null}

        <FeedSection
          title={t('feed.nearYou')}
          events={data?.nearYou ?? []}
          emptyLabel={centre ? t('feed.emptyNearYou') : t('feed.locationRationale')}
          horizontal
        />

        <FeedSection
          title={t('feed.following')}
          events={data?.fromArtistsYouFollow ?? []}
          emptyLabel={t('feed.emptyFollowing')}
        />

        <FeedSection
          title={t('feed.thisWeekend')}
          events={data?.thisWeekend ?? []}
          emptyLabel={t('feed.emptyWeekend')}
          horizontal
        />
      </ScrollView>
    </Screen>
  );
}

function FeedSection({
  title,
  events,
  emptyLabel,
  horizontal,
}: {
  title: string;
  events: EventSummary[];
  emptyLabel: string;
  horizontal?: boolean;
}) {
  return (
    <View>
      <SectionHeading title={title} />

      {events.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : horizontal ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={events}
          keyExtractor={(event) => event.id}
          contentContainerStyle={styles.rail}
          renderItem={({ item }) => <EventTile event={item} />}
        />
      ) : (
        <View>
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  locationPrompt: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
    gap: spacing.md,
  },
  promptTitle: { ...typography.heading, color: colors.text },
  promptBody: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
  orPickCity: { ...typography.label, color: colors.textFaint, marginTop: spacing.sm },
  rail: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
