import { normaliseName, slugify } from '@onstage/shared';
import type { Prisma } from '@prisma/client';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { sleep } from '../sources/http';

/**
 * South African artist catalogue from MusicBrainz.
 *
 * Seeds Onstage with real, currently active South African acts as unverified
 * profiles that the artists themselves can later claim. Only MusicBrainz core
 * data is used — names, aliases, places, external links — which is CC0. Tags
 * and genres are supplementary data under a non-commercial licence, so they
 * are deliberately not imported.
 *
 * A verified (claimed) profile belongs to the artist: once claimed, nothing
 * here overwrites it.
 *
 * MusicBrainz allows one request per second and asks for a User-Agent with
 * contact details: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
 */

const BASE_URL = process.env.MUSICBRAINZ_BASE_URL ?? 'https://musicbrainz.org/ws/2';
const USER_AGENT = `Onstage/0.1 ( ${process.env.MUSICBRAINZ_CONTACT ?? 'https://onstage.co.za'} )`;
const REQUEST_SPACING_MS = 1100;
const PAGE_SIZE = 100;
/** Active people and groups only: an act that has ended cannot play a show. */
const QUERY = 'country:ZA AND (type:person OR type:group) AND ended:false';

interface MbArea {
  name: string;
  type?: string | null;
}

interface MbArtist {
  id: string;
  name: string;
  type?: string | null;
  disambiguation?: string | null;
  'begin-area'?: MbArea | null;
  aliases?: { name: string }[] | null;
  relations?: { type: string; url?: { resource: string } }[];
}

let lastRequestAt = 0;

async function mbFetch<T>(path: string, attempt = 1): Promise<T> {
  const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  // 503 is MusicBrainz's rate-limit answer; back off and retry.
  if ((response.status === 503 || response.status >= 500) && attempt < 4) {
    await sleep(2 ** attempt * 1000);
    return mbFetch<T>(path, attempt + 1);
  }
  if (!response.ok) throw new Error(`MusicBrainz responded ${response.status} for ${path}`);
  return (await response.json()) as T;
}

/** MusicBrainz search pages no deeper than this, so bigger result sets are sliced. */
const MAX_SEARCH_RESULTS = 500;
const SLICE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

type SearchPage = { count: number; artists: MbArtist[] };

const search = (query: string, offset: number, limit = PAGE_SIZE) =>
  mbFetch<SearchPage>(
    `/artist?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&fmt=json`,
  );

/** Import or refresh every active South African artist. Returns counts. */
export async function importSouthAfricanArtists(): Promise<{
  created: number;
  updated: number;
  expected: number;
  seen: number;
}> {
  const counts = { created: 0, updated: 0, seen: 0 };
  const expected = (await search(QUERY, 0, 1)).count;

  // Slice by sort-name prefix until each slice fits under the paging cap.
  const queue = [...SLICE_CHARS];
  while (queue.length > 0) {
    const prefix = queue.shift() as string;
    const query = `${QUERY} AND sortname:${prefix}*`;
    const first = await search(query, 0);
    if (first.count > MAX_SEARCH_RESULTS && prefix.length < 4) {
      queue.unshift(...SLICE_CHARS.map((c) => prefix + c));
      continue;
    }

    let page = first;
    for (let offset = 0; ;) {
      for (const artist of page.artists) {
        counts.seen += 1;
        const outcome = await upsertArtist(artist);
        if (outcome !== 'skipped') counts[outcome] += 1;
      }
      offset += PAGE_SIZE;
      if (offset >= Math.min(page.count, MAX_SEARCH_RESULTS)) break;
      page = await search(query, offset);
    }
    logger.info({ prefix, slice: first.count, ...counts, expected }, 'MusicBrainz artists');
  }

  return { ...counts, expected };
}

async function upsertArtist(mb: MbArtist): Promise<'created' | 'updated' | 'skipped'> {
  const name = mb.name.trim();
  if (!name) return 'skipped';

  const key = normaliseName(name);
  const homeCity = mb['begin-area']?.type === 'City' ? mb['begin-area'].name : null;
  const aliasNames = [name, ...(mb.aliases ?? []).map((a) => a.name.trim())].filter(Boolean);
  const aliases = [...new Map(aliasNames.map((a) => [normaliseName(a), a])).entries()].filter(
    ([normalised]) => normalised,
  );

  // Already imported, or already known from a ticketing feed under this name
  // (and not yet tied to a different MusicBrainz artist).
  const [match] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM artists WHERE external_ids->>'musicbrainz_id' = ${mb.id}
    UNION ALL
    SELECT a.id FROM artists a JOIN artist_aliases al ON al.artist_id = a.id
    WHERE al.normalised_alias = ${key} AND NOT (a.external_ids ? 'musicbrainz_id')
    LIMIT 1
  `;
  const existing = match ? await prisma.artist.findUnique({ where: { id: match.id } }) : null;

  if (existing) {
    if (existing.verified) return 'skipped';
    const externalIds = {
      ...(existing.externalIds as Record<string, unknown>),
      musicbrainz_id: mb.id,
    };
    await prisma.artist.update({
      where: { id: existing.id },
      data: {
        externalIds: externalIds as Prisma.InputJsonValue,
        country: existing.country ?? 'ZA',
        homeCity: existing.homeCity ?? homeCity,
        bio: existing.bio ?? mb.disambiguation ?? null,
      },
    });
    await addAliases(existing.id, aliases);
    return 'updated';
  }

  const createdArtist = await prisma.artist.create({
    data: {
      name,
      slug: await uniqueArtistSlug(slugify(name)),
      country: 'ZA',
      homeCity,
      // MusicBrainz's one-line descriptor ("jazz pianist and composer") until
      // the artist claims the profile and writes their own.
      bio: mb.disambiguation || null,
      externalIds: { musicbrainz_id: mb.id } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await addAliases(createdArtist.id, aliases);
  return 'created';
}

async function addAliases(artistId: string, aliases: [string, string][]): Promise<void> {
  if (aliases.length === 0) return;
  await prisma.artistAlias.createMany({
    data: aliases.map(([normalisedAlias, alias]) => ({
      artistId,
      alias: alias.slice(0, 200),
      normalisedAlias: normalisedAlias.slice(0, 200),
    })),
    skipDuplicates: true,
  });
}

async function uniqueArtistSlug(base: string): Promise<string> {
  const seed = base || 'artist';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? seed : `${seed}-${attempt + 1}`;
    const taken = await prisma.artist.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${seed}-${Date.now().toString(36)}`;
}

/** Which of our link maps a MusicBrainz URL belongs in, and under what key. */
function classifyUrl(
  resource: string,
): { map: 'streaming' | 'social'; key: string; spotifyId?: string } | null {
  let host: string;
  try {
    host = new URL(resource).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (host === 'open.spotify.com') {
    const id = resource.match(/\/artist\/([A-Za-z0-9]{22})/)?.[1];
    return id ? { map: 'streaming', key: 'spotify', spotifyId: id } : null;
  }
  if (host === 'music.apple.com' || host === 'itunes.apple.com')
    return { map: 'streaming', key: 'apple_music' };
  if (host === 'youtube.com' || host === 'music.youtube.com')
    return { map: 'streaming', key: 'youtube' };
  if (host === 'soundcloud.com') return { map: 'streaming', key: 'soundcloud' };
  if (host === 'audiomack.com') return { map: 'streaming', key: 'audiomack' };
  if (host === 'instagram.com') return { map: 'social', key: 'instagram' };
  if (host === 'twitter.com' || host === 'x.com') return { map: 'social', key: 'x' };
  if (host === 'facebook.com') return { map: 'social', key: 'facebook' };
  if (host === 'tiktok.com') return { map: 'social', key: 'tiktok' };
  return null;
}

/**
 * Fill in streaming and social links for imported artists that have none yet.
 * One lookup per artist at one request a second, so this is a long job; it is
 * resumable because it only visits artists still missing links.
 */
export async function enrichArtistLinks(
  limit = 5000,
): Promise<{ enriched: number; visited: number }> {
  // musicbrainz_links_checked marks artists already looked up, so a re-run
  // resumes where the last one stopped instead of starting over.
  const artists = await prisma.$queryRaw<{ id: string; externalIds: Prisma.JsonValue }[]>`
    SELECT id, external_ids AS "externalIds" FROM artists
    WHERE verified = false
      AND external_ids ? 'musicbrainz_id'
      AND NOT (external_ids ? 'musicbrainz_links_checked')
      AND streaming_links = '{}'::jsonb
      AND social_links = '{}'::jsonb
    ORDER BY follower_count DESC
    LIMIT ${limit}
  `;

  let enriched = 0;
  for (const [index, artist] of artists.entries()) {
    const ids = artist.externalIds as Record<string, unknown>;
    let mb: MbArtist;
    try {
      mb = await mbFetch<MbArtist>(`/artist/${ids.musicbrainz_id as string}?inc=url-rels&fmt=json`);
    } catch (error) {
      logger.warn(
        { artistId: artist.id, err: (error as Error).message },
        'MusicBrainz lookup failed',
      );
      continue;
    }

    const streaming: Record<string, string> = {};
    const social: Record<string, string> = {};
    let spotifyId: string | undefined;
    for (const relation of mb.relations ?? []) {
      const resource = relation.url?.resource;
      if (!resource?.startsWith('https://')) continue;
      const kind = classifyUrl(resource);
      if (!kind) continue;
      const target = kind.map === 'streaming' ? streaming : social;
      target[kind.key] ??= resource;
      spotifyId ??= kind.spotifyId;
    }

    const found = Object.keys(streaming).length + Object.keys(social).length > 0;
    await prisma.artist.update({
      where: { id: artist.id },
      data: {
        streamingLinks: streaming as Prisma.InputJsonValue,
        socialLinks: social as Prisma.InputJsonValue,
        externalIds: {
          ...ids,
          ...(spotifyId ? { spotify_id: spotifyId } : {}),
          musicbrainz_links_checked: true,
        } as Prisma.InputJsonValue,
      },
    });
    if (found) enriched += 1;
    if ((index + 1) % 100 === 0) {
      logger.info({ visited: index + 1, of: artists.length, enriched }, 'MusicBrainz links');
    }
  }

  return { enriched, visited: artists.length };
}
