import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  appArtistLink,
  formatEventDateTime,
  formatRating,
  publicArtistUrl,
  type Artist,
  type EventSummary,
} from '@onstage/shared';
import { AppBanner } from '../../../components/app-banner';
import {
  getArtist,
  getArtistEvents,
  getSimilarArtists,
  WEB_BASE_URL,
} from '../../../lib/api';
import { jsonLd, safeUrl } from '../../../lib/safe';

export const revalidate = 900;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtist(slug);
  if (!artist) return { title: 'Artist not found' };

  const description =
    artist.bio?.slice(0, 160) ??
    `Upcoming shows, tickets and where to listen to ${artist.name}${
      artist.homeCity ? ` from ${artist.homeCity}` : ''
    }.`;

  return {
    title: `${artist.name} — tour dates and tickets`,
    description,
    alternates: { canonical: publicArtistUrl(WEB_BASE_URL, artist.slug) },
    openGraph: {
      title: artist.name,
      description,
      url: publicArtistUrl(WEB_BASE_URL, artist.slug),
      type: 'profile',
      images: [safeUrl(artist.bannerImage) ?? safeUrl(artist.profileImage)]
        .filter((url): url is string => Boolean(url))
        .map((url) => ({ url })),
    },
  };
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params;
  const artist = await getArtist(slug);
  if (!artist) notFound();

  const [upcoming, past, similar] = await Promise.all([
    getArtistEvents(artist.id, 'upcoming'),
    getArtistEvents(artist.id, 'past'),
    getSimilarArtists(artist.id),
  ]);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(artistJsonLd(artist, upcoming?.items ?? [])),
        }}
      />

      {safeUrl(artist.bannerImage) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="banner" src={safeUrl(artist.bannerImage)} alt="" />
      ) : null}

      <h1>
        {artist.name}
        {artist.verified ? ' ✓' : ''}
      </h1>

      <p className="muted">
        {[artist.genres.join(' · '), artist.homeCity].filter(Boolean).join(' — ')}
      </p>

      {/* Overall and live ratings are shown separately here too. Averaging them
          on the public page would undo the only rating nobody else has. */}
      <p className="faint">
        {artist.followerCount.toLocaleString('en-ZA')} following · Overall{' '}
        {formatRating(artist.ratingAvg, artist.ratingCount)} · Live{' '}
        {formatRating(artist.liveRatingAvg, artist.liveRatingCount)}
      </p>

      {artist.bio ? <p>{artist.bio}</p> : null}

      <AppBanner deepLink={appArtistLink(artist.slug)} label={`Follow ${artist.name}`} />

      {Object.keys(artist.streamingLinks).length > 0 ? (
        <>
          <h2>Listen</h2>
          <p className="row">
            {Object.entries(artist.streamingLinks).map(([platform, url]) => (
              <a
                key={platform}
                className="cta cta-secondary"
                href={safeUrl(url)}
                rel="noopener"
                target="_blank"
              >
                {platform.replace('_', ' ')}
              </a>
            ))}
          </p>
        </>
      ) : null}

      <h2>Upcoming shows</h2>
      <EventList
        events={upcoming?.items ?? []}
        empty={`No announced shows for ${artist.name} right now.`}
      />

      {(past?.items.length ?? 0) > 0 ? (
        <>
          <h2>Past shows</h2>
          <EventList events={past?.items ?? []} empty="" />
        </>
      ) : null}

      {(similar?.length ?? 0) > 0 ? (
        <>
          <h2>Similar artists</h2>
          <ul className="list">
            {similar?.map((other) => (
              <li key={other.id}>
                <Link href={`/artist/${other.slug}`}>
                  <div className="card">
                    <strong>{other.name}</strong>
                    <div className="faint">{other.genres.slice(0, 3).join(' · ')}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

function EventList({ events, empty }: { events: EventSummary[]; empty: string }) {
  if (events.length === 0) return <p className="muted">{empty}</p>;

  return (
    <ul className="list">
      {events.map((event) => (
        <li key={event.id}>
          <Link href={`/event/${event.slug}`}>
            <div className="card">
              <strong>{formatEventDateTime(event.startsAt, event.localTimezone)}</strong>
              <div>{event.venue.name}, {event.venue.city}</div>
              <div className="faint">{event.title}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** schema.org MusicGroup, with the upcoming dates attached. */
function artistJsonLd(artist: Artist, upcoming: EventSummary[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: artist.name,
    url: publicArtistUrl(WEB_BASE_URL, artist.slug),
    description: artist.bio ?? undefined,
    image: safeUrl(artist.profileImage),
    genre: artist.genres,
    foundingLocation: artist.homeCity ?? undefined,
    sameAs: [...Object.values(artist.streamingLinks), ...Object.values(artist.socialLinks)]
      .map((url) => safeUrl(url))
      .filter(Boolean),
    aggregateRating:
      artist.ratingAvg !== null && artist.ratingCount > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: artist.ratingAvg,
            ratingCount: artist.ratingCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
    event: upcoming.map((event) => ({
      '@type': 'MusicEvent',
      name: event.title,
      startDate: event.startsAt,
      url: `${WEB_BASE_URL}/event/${event.slug}`,
      location: {
        '@type': 'MusicVenue',
        name: event.venue.name,
        address: {
          '@type': 'PostalAddress',
          addressLocality: event.venue.city,
          addressCountry: event.venue.country,
        },
      },
    })),
  };
}
