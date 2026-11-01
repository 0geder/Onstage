import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  appEventLink,
  formatEventDateTime,
  formatPriceRange,
  LIVESTREAM_PLATFORM_LABELS,
  LIVESTREAM_PLATFORMS,
  publicEventUrl,
  EVENT_STATUS_LABELS,
  LINEUP_ROLE_LABELS,
  TICKET_PROVIDER_LABELS,
  type EventDetail,
} from '@onstage/shared';
import { AppBanner } from '../../../components/app-banner';
import { BrandIcon } from '../../../components/brand';
import { getEvent, getTravel, WEB_BASE_URL } from '../../../lib/api';
import { jsonLd, safeUrl } from '../../../lib/safe';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) return { title: 'Event not found' };

  const when = formatEventDateTime(event.startsAt, event.localTimezone);
  const description =
    `${event.primaryArtist.name} at ${event.venue.name}, ${event.venue.city} on ${when}. ` +
    `${EVENT_STATUS_LABELS[event.status]}. Line-up, tickets and directions on Onstage.`;

  return {
    title: `${event.title} — ${event.venue.name}`,
    description,
    alternates: { canonical: publicEventUrl(WEB_BASE_URL, event.slug) },
    openGraph: {
      title: event.title,
      description,
      url: publicEventUrl(WEB_BASE_URL, event.slug),
      type: 'article',
      images: poster(event) ? [{ url: poster(event)! }] : undefined,
    },
  };
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();

  const travel = await getTravel(event.id);
  const when = formatEventDateTime(event.startsAt, event.localTimezone);

  return (
    <article>
      <script
        type="application/ld+json"
        // Structured data is the entire point of this page existing: it is what
        // puts the show into event-rich search results rather than a plain link.
        dangerouslySetInnerHTML={{ __html: jsonLd(eventJsonLd(event)) }}
      />

      {poster(event) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="poster" src={poster(event)} alt={`Poster for ${event.title}`} />
      ) : null}

      <h1>{event.title}</h1>

      <p>
        <span className="badge">{EVENT_STATUS_LABELS[event.status]}</span>{' '}
        {event.isPromoted ? <span className="badge badge-promoted">Promoted</span> : null}
      </p>

      <p className="muted">
        <strong>{when}</strong> · {event.venue.name}, {event.venue.city}
      </p>

      {event.description ? <p className="muted">{event.description}</p> : null}

      <AppBanner
        deepLink={appEventLink(event.slug)}
        label={`Going to ${event.primaryArtist.name}?`}
      />

      <Livestreams event={event} />

      <h2>Line-up</h2>
      <ul className="list">
        {event.lineup.map((entry) => (
          <li key={entry.artist.id}>
            {/* Internal links between artists and events are what make this set
                of pages crawlable as a graph rather than as isolated leaves. */}
            <Link href={`/artist/${entry.artist.slug}`}>
              <div className="card">
                <strong>{entry.artist.name}</strong>
                <div className="faint">{LINEUP_ROLE_LABELS[entry.role]}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Tickets</h2>
      {event.ticketOptions.length === 0 ? (
        <p className="muted">No ticket links have been published yet.</p>
      ) : (
        <>
          {event.priceRange ? <p>{formatPriceRange(event.priceRange)}</p> : null}
          <ul className="list">
            {event.ticketOptions.map((option) => (
              <li key={option.id}>
                <div className="card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{option.tierName}</strong>
                      <div className="faint">
                        <BrandIcon brand={option.provider} size={16} />{' '}
                        {TICKET_PROVIDER_LABELS[option.provider]} ·{' '}
                        {option.availability.replace('_', ' ')}
                      </div>
                    </div>
                    {option.availability === 'sold_out' || !safeUrl(option.purchaseUrl) ? (
                      <span className="faint">
                        {option.availability === 'sold_out' ? 'Sold out' : 'Link unavailable'}
                      </span>
                    ) : (
                      // rel=nofollow sponsored: these are commercial outbound
                      // links and should be declared as such.
                      <a
                        className="cta"
                        href={safeUrl(option.purchaseUrl)}
                        rel="nofollow sponsored noopener"
                        target="_blank"
                      >
                        Get tickets
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="faint">Tickets are sold by the provider. Onstage does not process payments.</p>

      <h2>Getting there</h2>
      <p className="muted">
        {event.venue.name}
        {event.venue.addressLine ? `, ${event.venue.addressLine}` : ''}
      </p>

      {travel ? (
        <p className="row">
          <a
            className="cta cta-secondary"
            href={travel.directions.google.web}
            rel="noopener"
            target="_blank"
          >
            <BrandIcon brand="google_maps" />
            Directions
          </a>
          <a
            className="cta cta-secondary"
            href={travel.rides.bolt.web}
            rel="nofollow noopener"
            target="_blank"
          >
            <BrandIcon brand="bolt" />
            Bolt
          </a>
          <a
            className="cta cta-secondary"
            href={travel.rides.uber.web}
            rel="nofollow noopener"
            target="_blank"
          >
            <BrandIcon brand="uber" />
            Uber
          </a>
          <a
            className="cta cta-secondary"
            href={travel.rides.indrive.web}
            rel="nofollow noopener"
            target="_blank"
          >
            <BrandIcon brand="indrive" />
            inDrive
          </a>
        </p>
      ) : null}

      <h2>Venue information</h2>
      <table className="info">
        <tbody>
          <tr>
            <td>Wheelchair access</td>
            <td>{yesNo(event.venue.wheelchairAccess)}</td>
          </tr>
          <tr>
            <td>Cloakroom</td>
            <td>{yesNo(event.venue.cloakroom)}</td>
          </tr>
          <tr>
            <td>Age restriction</td>
            <td>{event.ageRestriction ?? event.venue.ageRestriction ?? 'Not stated'}</td>
          </tr>
          <tr>
            <td>Re-entry</td>
            <td>{event.venue.reentryPolicy ?? 'Not stated'}</td>
          </tr>
        </tbody>
      </table>

      <div className="warning">
        Onstage is not a party to any ticket sale between users. Deals arranged in the app happen at
        your own risk — never pay before you have verified the seller and the ticket.
      </div>
    </article>
  );
}

/** `null` means unknown. Rendering that as "No" would be a lie with consequences. */
function yesNo(value: boolean | null): string {
  if (value === null) return 'Not stated';
  return value ? 'Yes' : 'No';
}

function poster(event: EventDetail): string | undefined {
  return safeUrl(event.posterImage);
}

/** schema.org MusicEvent. */
/** Platforms the show is broadcast on, in display order, with a safe URL. */
function livestreams(event: EventDetail) {
  return LIVESTREAM_PLATFORMS.flatMap((platform) => {
    const url = safeUrl(event.livestreamLinks?.[platform]);
    return url ? [{ platform, url }] : [];
  });
}

/** Rendered only when the headliner's team has added a stream. */
function Livestreams({ event }: { event: EventDetail }) {
  const streams = livestreams(event);
  if (streams.length === 0) return null;
  return (
    <>
      <h2>Watch live</h2>
      <p className="row">
        {streams.map(({ platform, url }) => (
          <a key={platform} className="cta cta-secondary" href={url} rel="noopener" target="_blank">
            <BrandIcon brand={platform} />
            {LIVESTREAM_PLATFORM_LABELS[platform]}
          </a>
        ))}
      </p>
      <p className="faint">Streamed by the artist on their own channel.</p>
    </>
  );
}

function eventJsonLd(event: EventDetail) {
  const statusMap: Record<string, string> = {
    cancelled: 'https://schema.org/EventCancelled',
    postponed: 'https://schema.org/EventPostponed',
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: event.title,
    url: publicEventUrl(WEB_BASE_URL, event.slug),
    startDate: event.startsAt,
    doorTime: event.doorsOpenAt ?? undefined,
    eventStatus: statusMap[event.status] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode:
      livestreams(event).length > 0
        ? 'https://schema.org/MixedEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
    image: poster(event),
    description: event.description ?? undefined,
    location: [
      ...livestreams(event).map(({ url }) => ({ '@type': 'VirtualLocation', url })),
      {
        '@type': 'MusicVenue',
        name: event.venue.name,
        address: {
          '@type': 'PostalAddress',
          streetAddress: event.venue.addressLine ?? undefined,
          addressLocality: event.venue.city,
          addressCountry: event.venue.country,
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: event.venue.lat,
          longitude: event.venue.lng,
        },
      },
    ],
    performer: event.lineup.map((entry) => ({
      '@type': 'MusicGroup',
      name: entry.artist.name,
      url: `${WEB_BASE_URL}/artist/${entry.artist.slug}`,
    })),
    offers: event.ticketOptions.map((option) => ({
      '@type': 'Offer',
      name: option.tierName,
      url: safeUrl(option.purchaseUrl),
      price: option.priceMinor !== null ? (option.priceMinor / 100).toFixed(2) : undefined,
      priceCurrency: option.currency,
      availability:
        option.availability === 'sold_out'
          ? 'https://schema.org/SoldOut'
          : option.availability === 'low'
            ? 'https://schema.org/LimitedAvailability'
            : 'https://schema.org/InStock',
      validFrom: event.lastSyncedAt ?? undefined,
    })),
  };
}
