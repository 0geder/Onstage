import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Camera, Map as VenueMap, ViewAnnotation } from '@maplibre/maplibre-react-native';
import {
  formatEventDateTime,
  formatMoney,
  formatPriceRange,
  LIVESTREAM_PLATFORM_LABELS,
  LIVESTREAM_PLATFORMS,
  publicEventUrl,
  shareUrl,
  TICKET_PROVIDER_LABELS,
  type CommentTag,
  type DeepLinkPair,
} from '@onstage/shared';
import {
  useEvent,
  useGroupPlans,
  useSetAttendance,
  useTicketLink,
  useTravelOptions,
} from '../../src/api/hooks';
import { BrandIcon, isBrand } from '../../src/components/brand';
import { EventThread } from '../../src/components/event-thread';
import {
  Avatar,
  Button,
  Divider,
  Loading,
  ErrorState,
  PromotedBadge,
  Screen,
  SectionHeading,
  StatusBadge,
} from '../../src/components/ui';
import { currentLocale } from '../../src/i18n';
import { colors, radii, spacing, typography } from '../../src/theme';

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://onstage.co.za';

// OpenFreeMap: OpenStreetMap vector tiles with no key, account or usage cap.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** How long after the start a show counts as "live now". Most gigs end within this. */
const LIVE_WINDOW_MS = 5 * 3_600_000;

export default function EventScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const threadOffset = useRef(0);

  const [threadTag, setThreadTag] = useState<CommentTag | undefined>();
  // Read once when the screen opens; "live now" does not need to tick.
  const [openedAt] = useState(Date.now);

  const event = useEvent(String(slug));
  const eventId = event.data?.id ?? '';
  const travel = useTravelOptions(eventId);
  const plans = useGroupPlans(eventId);
  const attendance = useSetAttendance(eventId, String(slug));
  const router = useRouter();
  const ticketLink = useTicketLink(eventId);

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

  const data = event.data;
  const soldOut = data.status === 'sold_out';
  const streams = LIVESTREAM_PLATFORMS.filter((platform) => data.livestreamLinks?.[platform]);
  const startsAt = new Date(data.startsAt).getTime();
  const isLive = openedAt >= startsAt && openedAt < startsAt + LIVE_WINDOW_MS;

  /**
   * Opening a provider. The click is recorded server-side for affiliate
   * attribution, and the checkout happens on the provider's own site — Onstage
   * never takes a payment.
   */
  const openTickets = (optionId: string) => {
    ticketLink.mutate(optionId, {
      onSuccess: ({ url }) => void WebBrowser.openBrowserAsync(url),
      onError: (error) => Alert.alert(t('event.tickets'), (error as Error).message),
    });
  };

  /** Try the provider's app, fall back to the web. Never leave the user stuck. */
  const openDeepLink = async (pair: DeepLinkPair) => {
    try {
      if (await Linking.canOpenURL(pair.app)) {
        await Linking.openURL(pair.app);
        return;
      }
    } catch {
      // canOpenURL throws on some Android configurations; fall through.
    }
    await WebBrowser.openBrowserAsync(pair.web);
  };

  // inDrive can't take a destination in a link, so hand the rider the address
  // to paste instead of making them retype it.
  const openInDrive = async (pair: DeepLinkPair) => {
    const address = [data.venue.name, data.venue.addressLine].filter(Boolean).join(', ');
    await Clipboard.setStringAsync(address);
    Alert.alert('inDrive', t('event.indriveAddressCopied'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('event.openInDrive'), onPress: () => void openDeepLink(pair) },
    ]);
  };

  const scrollToThread = (tag?: CommentTag) => {
    setThreadTag(tag);
    scrollRef.current?.scrollTo({ y: threadOffset.current, animated: true });
  };

  const onShare = () =>
    void Share.share({
      message: shareUrl(publicEventUrl(WEB_BASE, data.slug), 'app'),
      title: t('share.shareEvent'),
    });

  return (
    <Screen>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {data.posterImage ? (
          <Image source={{ uri: data.posterImage }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, { backgroundColor: colors.surfaceRaised }]} />
        )}

        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <StatusBadge status={data.status} />
            {data.isPromoted ? <PromotedBadge /> : null}
          </View>

          <Text style={styles.title}>{data.title}</Text>

          {/* Always the venue's local time, never the viewer's. */}
          <Text style={styles.when}>
            {formatEventDateTime(data.startsAt, data.localTimezone, currentLocale())}
          </Text>
          {data.doorsOpenAt ? (
            <Text style={styles.doors}>
              {t('event.doorsOpen', {
                time: formatEventDateTime(data.doorsOpenAt, data.localTimezone, currentLocale()),
              })}
            </Text>
          ) : null}

          <Text style={styles.venue}>
            {data.venue.name} · {data.venue.city}
          </Text>
        </View>

        <View style={styles.attendanceRow}>
          <Button
            label={t('event.interested')}
            variant={data.viewerAttendance === 'interested' ? 'primary' : 'secondary'}
            style={{ flex: 1 }}
            loading={attendance.isPending}
            onPress={() =>
              attendance.mutate(data.viewerAttendance === 'interested' ? null : 'interested')
            }
          />
          <Button
            label={t('event.going')}
            variant={data.viewerAttendance === 'going' ? 'primary' : 'secondary'}
            style={{ flex: 1 }}
            loading={attendance.isPending}
            onPress={() => attendance.mutate(data.viewerAttendance === 'going' ? null : 'going')}
          />
          <Button label={t('share.share')} variant="secondary" onPress={onShare} />
        </View>

        {/* Only shows that are actually broadcast get this section, so most
            event pages are unchanged. The stream plays in the platform's own app. */}
        {streams.length > 0 ? (
          <>
            <SectionHeading title={isLive ? t('event.watchLiveNow') : t('event.watchLive')} />
            <View style={styles.streams}>
              <View style={styles.travelRow}>
                {streams.map((platform) => (
                  <Button
                    key={platform}
                    label={LIVESTREAM_PLATFORM_LABELS[platform]}
                    icon={<BrandIcon brand={platform} />}
                    variant={isLive ? 'primary' : 'secondary'}
                    style={{ flex: 1 }}
                    onPress={() => void Linking.openURL(data.livestreamLinks[platform] as string)}
                  />
                ))}
              </View>
              {!isLive ? <Text style={styles.disclaimer}>{t('event.watchLiveHint')}</Text> : null}
            </View>
          </>
        ) : null}
        {data.viewerManages && data.status !== 'cancelled' ? (
          <View style={styles.streams}>
            <Button
              label={streams.length > 0 ? t('event.editLivestreams') : t('event.addLivestream')}
              variant="ghost"
              onPress={() => router.push(`/event/livestreams/${data.slug}`)}
            />
          </View>
        ) : null}

        {/* Line-up. Every name is a link — this is the discovery engine, and
            most new-artist exposure comes from someone tapping a support act. */}
        <SectionHeading title={t('event.lineup')} />
        <View style={styles.lineup}>
          {data.lineup.map((entry) => (
            <Link key={entry.artist.id} href={`/artist/${entry.artist.slug}`} asChild>
              {/* Link's asChild drops a function `style`, so the row is laid out inside. */}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${entry.artist.name}, ${t(`role.${entry.role}`)}`}
              >
                {({ pressed }) => (
                  <View style={[styles.lineupRow, pressed && { opacity: 0.7 }]}>
                    <Avatar uri={entry.artist.profileImage} size={40} label={entry.artist.name} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineupName}>{entry.artist.name}</Text>
                      <Text style={styles.lineupRole}>{t(`role.${entry.role}`)}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                )}
              </Pressable>
            </Link>
          ))}
        </View>

        <Divider />

        <SectionHeading title={t('event.tickets')} />
        <View style={styles.tickets}>
          {data.priceRange ? (
            <Text style={styles.priceRange}>
              {formatPriceRange(data.priceRange, currentLocale())}
            </Text>
          ) : null}

          {data.ticketOptions.length === 0 ? (
            <Text style={styles.mutedBody}>{t('event.noTickets')}</Text>
          ) : (
            data.ticketOptions.map((option) => (
              <View key={option.id} style={styles.ticketRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticketTier}>{option.tierName}</Text>
                  <View style={styles.ticketSeller}>
                    {isBrand(option.provider) ? (
                      <BrandIcon brand={option.provider} size={16} />
                    ) : null}
                    <Text style={styles.ticketMeta}>
                      {TICKET_PROVIDER_LABELS[option.provider]}
                      {option.priceMinor !== null
                        ? ` · ${formatMoney(option.priceMinor, option.currency, currentLocale())}`
                        : ''}
                    </Text>
                  </View>
                </View>
                <Button
                  label={t('event.getTickets')}
                  variant={option.availability === 'sold_out' ? 'ghost' : 'secondary'}
                  disabled={option.availability === 'sold_out'}
                  loading={ticketLink.isPending}
                  onPress={() => openTickets(option.id)}
                />
              </View>
            ))
          )}

          {/* When a show is sold out the provider link is a dead end, so the
              primary action becomes the thread, filtered to people with spares. */}
          {soldOut ? (
            <Button
              label={t('event.findInThread')}
              onPress={() => scrollToThread('have_tickets')}
            />
          ) : null}

          {/* Saving the show is what subscribes someone to the "tickets are
              back" alert, so the button is a shortcut to Interested. */}
          {soldOut && !data.viewerAttendance ? (
            <Button
              label={t('event.notifyTicketsBack')}
              variant="secondary"
              loading={attendance.isPending}
              onPress={() => attendance.mutate('interested')}
            />
          ) : null}
          {soldOut && data.viewerAttendance ? (
            <Text style={styles.disclaimer}>{t('event.ticketsBackWatching')}</Text>
          ) : null}

          <Text style={styles.disclaimer}>{t('event.ticketDisclaimer')}</Text>
        </View>

        <Divider />

        <SectionHeading title={t('event.gettingThere')} />
        <View style={styles.travel}>
          <View style={styles.map} pointerEvents="none">
            <VenueMap mapStyle={MAP_STYLE} dragPan={false} touchZoom={false} compass={false}>
              <Camera initialViewState={{ center: [data.venue.lng, data.venue.lat], zoom: 14 }} />
              <ViewAnnotation id="venue" lngLat={[data.venue.lng, data.venue.lat]}>
                <View style={styles.mapPin} />
              </ViewAnnotation>
            </VenueMap>
          </View>

          {data.venue.addressLine ? (
            <Text style={styles.address}>{data.venue.addressLine}</Text>
          ) : null}

          {travel.data ? (
            <>
              <View style={styles.travelRow}>
                <Button
                  label={t('event.directions')}
                  icon={<BrandIcon brand="google_maps" />}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => void openDeepLink(travel.data.directions.google)}
                />
              </View>

              {/* Bolt first: larger South African footprint, and this ordering is
                  the difference between a used feature and a decorative one. */}
              <Text style={styles.travelLabel}>{t('event.getARide')}</Text>
              <View style={styles.travelRow}>
                <Button
                  label="Bolt"
                  icon={<BrandIcon brand="bolt" />}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => void openDeepLink(travel.data.rides.bolt)}
                />
                <Button
                  label="Uber"
                  icon={<BrandIcon brand="uber" />}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => void openDeepLink(travel.data.rides.uber)}
                />
                <Button
                  label="inDrive"
                  icon={<BrandIcon brand="indrive" />}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => void openInDrive(travel.data.rides.indrive)}
                />
              </View>

              <Text style={styles.disclaimer}>{t('event.rideDisclaimer')}</Text>
            </>
          ) : null}
        </View>

        <VenueInformation venue={data.venue} eventAgeRestriction={data.ageRestriction} />

        <Divider />

        <SectionHeading title={t('event.whoIsGoing')} />
        <View style={styles.going}>
          {(plans.data?.connectionsGoing.length ?? 0) > 0 ? (
            <>
              <Text style={styles.goingSummary}>
                {t('event.connectionsGoing', { count: plans.data?.connectionsGoing.length ?? 0 })}
              </Text>
              <View style={styles.goingAvatars}>
                {plans.data?.connectionsGoing.slice(0, 8).map((person) => (
                  <View key={person.id} style={styles.goingPerson}>
                    <Avatar uri={person.avatar} size={40} label={person.displayName} />
                    <Text style={styles.goingName} numberOfLines={1}>
                      {person.displayName}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.mutedBody}>{t('event.nobodyYouKnow')}</Text>
          )}

          <Text style={styles.goingTotal}>
            {t('event.totalGoing', { count: plans.data?.totalGoing ?? data.attendance.going })}
          </Text>
        </View>

        <Divider />

        <View
          onLayout={(layout) => {
            threadOffset.current = layout.nativeEvent.layout.y;
          }}
        >
          <EventThread
            eventId={data.id}
            startsAt={data.startsAt}
            initialTag={threadTag}
            onTagChange={setThreadTag}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * Accessibility and logistics.
 *
 * A null field renders as "not stated", never as "no" — telling a wheelchair
 * user a venue has no access when nobody has checked is worse than admitting
 * we do not know.
 */
function VenueInformation({
  venue,
  eventAgeRestriction,
}: {
  venue: {
    wheelchairAccess?: boolean | null;
    cloakroom?: boolean | null;
    reentryPolicy?: string | null;
    ageRestriction?: string | null;
  };
  eventAgeRestriction: string | null;
}) {
  const { t } = useTranslation();

  const yesNo = (value?: boolean | null) =>
    value === null || value === undefined
      ? t('common.notStated')
      : value
        ? t('event.yes')
        : t('event.no');

  const age = eventAgeRestriction ?? venue.ageRestriction;

  return (
    <View>
      <SectionHeading title={t('event.venueInfo')} />
      <View style={styles.venueInfo}>
        <InfoRow label={t('event.wheelchairAccess')} value={yesNo(venue.wheelchairAccess)} />
        <InfoRow label={t('event.cloakroom')} value={yesNo(venue.cloakroom)} />
        <InfoRow label={t('event.ageRestriction')} value={age ?? t('common.notStated')} />
        <InfoRow label={t('event.reentry')} value={venue.reentryPolicy ?? t('common.notStated')} />
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { width: '100%', height: 320 },
  header: { padding: spacing.lg, gap: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  when: { ...typography.heading, color: colors.accent },
  doors: { ...typography.caption, color: colors.textMuted },
  venue: { ...typography.body, color: colors.textMuted },

  attendanceRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },

  lineup: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  lineupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  lineupName: { ...typography.heading, color: colors.text },
  lineupRole: { ...typography.caption, color: colors.textFaint },
  chevron: { color: colors.textFaint, fontSize: 22 },

  streams: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  tickets: { paddingHorizontal: spacing.lg, gap: spacing.md },
  priceRange: { ...typography.title, color: colors.text },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  ticketTier: { ...typography.heading, color: colors.text },
  ticketSeller: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ticketMeta: { ...typography.caption, color: colors.textFaint },
  disclaimer: { ...typography.caption, color: colors.textFaint, lineHeight: 17 },
  mutedBody: { ...typography.body, color: colors.textMuted },

  travel: { paddingHorizontal: spacing.lg, gap: spacing.md },
  map: { width: '100%', height: 170, borderRadius: radii.md, overflow: 'hidden' },
  mapPin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  address: { ...typography.caption, color: colors.textMuted },
  travelRow: { flexDirection: 'row', gap: spacing.sm },
  travelLabel: { ...typography.label, color: colors.textFaint },

  venueInfo: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  infoLabel: { ...typography.body, color: colors.textMuted },
  infoValue: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: 'right' },

  going: { paddingHorizontal: spacing.lg, gap: spacing.md },
  goingSummary: { ...typography.body, color: colors.text },
  goingAvatars: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  goingPerson: { width: 64, alignItems: 'center', gap: spacing.xs },
  goingName: { ...typography.caption, color: colors.textFaint },
  goingTotal: { ...typography.caption, color: colors.textFaint },
});
