import { Prisma } from '@prisma/client';

/**
 * Column lists for raw queries.
 *
 * Two things force this to be explicit rather than `SELECT a.*`:
 *
 *  1. `artists.search_vector` is a tsvector, which the Prisma client cannot
 *     deserialise. A wildcard select fails at runtime the moment the query
 *     returns a row.
 *  2. Raw queries hand back the database's own column names, not the camelCase
 *     names the generated client maps to. Without these aliases every mapper
 *     reading `row.followerCount` silently gets `undefined`.
 *
 * So the aliases here are what make a raw row interchangeable with a row the
 * Prisma client returned, and the mappers can stay unaware of which is which.
 */
export const ARTIST_COLUMNS = Prisma.sql`
  a.id,
  a.name,
  a.slug,
  a.verified,
  a.bio,
  a.genres,
  a.home_city AS "homeCity",
  a.country,
  a.profile_image AS "profileImage",
  a.banner_image AS "bannerImage",
  a.streaming_links AS "streamingLinks",
  a.social_links AS "socialLinks",
  a.external_ids AS "externalIds",
  a.follower_count AS "followerCount",
  a.rating_avg AS "ratingAvg",
  a.rating_count AS "ratingCount",
  a.live_rating_avg AS "liveRatingAvg",
  a.live_rating_count AS "liveRatingCount",
  a.is_promoted AS "isPromoted",
  a.promoted_until AS "promotedUntil",
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt"
`;
