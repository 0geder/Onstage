-- Onstage initial schema.
--
-- A few objects here cannot be expressed in schema.prisma and are therefore
-- invisible to `prisma migrate dev` drift detection. They are deliberate:
--   * generated columns (venues.geog, artists.search_vector)
--   * partial unique indexes on ratings
--   * trigram indexes backing typo-tolerant search
--   * CHECK constraints
-- Treat this file as authoritative for those, and prefer `prisma migrate deploy`
-- over `migrate dev` once the project has a shared database.

CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- array_to_string is declared STABLE, not IMMUTABLE, because in the general case
-- an element type's output function need not be immutable. For text[] it is, so
-- this wrapper states that explicitly and lets the search vector below be a
-- generated column instead of a trigger.
CREATE OR REPLACE FUNCTION onstage_text_array_to_string(arr TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT array_to_string(arr, ' ') $$;

-- ─────────────────────────── Enums ───────────────────────────

CREATE TYPE "event_status" AS ENUM ('announced', 'on_sale', 'low_stock', 'sold_out', 'postponed', 'cancelled');
CREATE TYPE "event_source" AS ENUM ('bandsintown', 'songkick', 'ticketmaster', 'quicket', 'webtickets', 'manual', 'artist_submitted');
CREATE TYPE "lineup_role" AS ENUM ('headliner', 'support', 'opener', 'dj_set');
CREATE TYPE "ticket_provider" AS ENUM ('quicket', 'webtickets', 'computicket', 'ticketmaster', 'howler', 'other');
CREATE TYPE "ticket_availability" AS ENUM ('available', 'low', 'sold_out');
CREATE TYPE "attendance_state" AS ENUM ('interested', 'going', 'attended');
CREATE TYPE "comment_tag" AS ENUM ('none', 'have_tickets', 'want_tickets', 'going', 'question');
CREATE TYPE "report_reason" AS ENUM ('scam', 'spam', 'harassment', 'off_topic', 'offsite_payment', 'other');
CREATE TYPE "report_status" AS ENUM ('open', 'actioned', 'dismissed');
CREATE TYPE "moderation_state" AS ENUM ('visible', 'flagged', 'hidden');
CREATE TYPE "outbox_status" AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE "comment_thread" AS ENUM ('planning', 'recap');
CREATE TYPE "consent_type" AS ENUM ('location', 'push_notifications', 'marketing_email', 'analytics');

-- ─────────────────────────── Artists ───────────────────────────

CREATE TABLE "artists" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "home_city" VARCHAR(120),
    "country" VARCHAR(2),
    "profile_image" TEXT,
    "banner_image" TEXT,
    "streaming_links" JSONB NOT NULL DEFAULT '{}',
    "social_links" JSONB NOT NULL DEFAULT '{}',
    "external_ids" JSONB NOT NULL DEFAULT '{}',
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "rating_avg" DOUBLE PRECISION,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "live_rating_avg" DOUBLE PRECISION,
    "live_rating_count" INTEGER NOT NULL DEFAULT 0,
    "is_promoted" BOOLEAN NOT NULL DEFAULT false,
    "promoted_until" TIMESTAMPTZ(6),
    "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(onstage_text_array_to_string("genres"), '')), 'B') ||
        setweight(to_tsvector('simple', coalesce("home_city", '')), 'C')
    ) STORED,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");
CREATE INDEX "artists_country_home_city_idx" ON "artists"("country", "home_city");
CREATE INDEX "artists_verified_idx" ON "artists"("verified");
CREATE INDEX "artists_search_vector_idx" ON "artists" USING GIN ("search_vector");
-- Trigram index: this is what makes "blk coffe" find "Black Coffee".
CREATE INDEX "artists_name_trgm_idx" ON "artists" USING GIN ("name" gin_trgm_ops);

CREATE TABLE "artist_aliases" (
    "id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "alias" VARCHAR(200) NOT NULL,
    "normalised_alias" VARCHAR(200) NOT NULL,

    CONSTRAINT "artist_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_aliases_artist_id_normalised_alias_key" ON "artist_aliases"("artist_id", "normalised_alias");
CREATE INDEX "artist_aliases_normalised_alias_idx" ON "artist_aliases"("normalised_alias");
CREATE INDEX "artist_aliases_alias_trgm_idx" ON "artist_aliases" USING GIN ("alias" gin_trgm_ops);

-- ─────────────────────────── Venues ───────────────────────────

CREATE TABLE "venues" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "address_line" TEXT,
    "city" VARCHAR(120) NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER,
    "google_place_id" TEXT,
    "image" TEXT,
    "website" TEXT,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Johannesburg',
    -- NULL means "unknown", which the UI must not render as "no".
    "wheelchair_access" BOOLEAN,
    "age_restriction" VARCHAR(40),
    "reentry_policy" TEXT,
    "cloakroom" BOOLEAN,
    "geog" geography(Point, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography
    ) STORED,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venues_lat_range" CHECK ("lat" BETWEEN -90 AND 90),
    CONSTRAINT "venues_lng_range" CHECK ("lng" BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");
CREATE UNIQUE INDEX "venues_google_place_id_key" ON "venues"("google_place_id");
CREATE INDEX "venues_city_country_idx" ON "venues"("city", "country");
-- Backs "events within N km of me" and the ingestion venue-proximity match.
CREATE INDEX "venues_geog_idx" ON "venues" USING GIST ("geog");

-- ─────────────────────────── Events ───────────────────────────

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "primary_artist_id" UUID NOT NULL,
    "venue_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "local_timezone" VARCHAR(64) NOT NULL,
    "doors_open_at" TIMESTAMPTZ(6),
    "status" "event_status" NOT NULL DEFAULT 'announced',
    "age_restriction" VARCHAR(40),
    "description" TEXT,
    "poster_image" TEXT,
    "source" "event_source" NOT NULL,
    "source_id" VARCHAR(200),
    "source_url" TEXT,
    "last_synced_at" TIMESTAMPTZ(6),
    "on_sale_at" TIMESTAMPTZ(6),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_promoted" BOOLEAN NOT NULL DEFAULT false,
    "promoted_until" TIMESTAMPTZ(6),
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "interested_count" INTEGER NOT NULL DEFAULT 0,
    "going_count" INTEGER NOT NULL DEFAULT 0,
    "attended_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");
-- Idempotent ingestion upserts key on this pair.
CREATE UNIQUE INDEX "events_source_source_id_key" ON "events"("source", "source_id");
CREATE INDEX "events_starts_at_idx" ON "events"("starts_at");
CREATE INDEX "events_primary_artist_id_starts_at_idx" ON "events"("primary_artist_id", "starts_at");
CREATE INDEX "events_venue_id_starts_at_idx" ON "events"("venue_id", "starts_at");
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");
-- Drives the configurable on-sale reminder sweep.
CREATE INDEX "events_on_sale_at_idx" ON "events"("on_sale_at");

CREATE TABLE "event_lineups" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "billing_position" INTEGER NOT NULL,
    "role" "lineup_role" NOT NULL DEFAULT 'support',

    CONSTRAINT "event_lineups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_lineups_event_id_artist_id_key" ON "event_lineups"("event_id", "artist_id");
CREATE INDEX "event_lineups_artist_id_idx" ON "event_lineups"("artist_id");
CREATE INDEX "event_lineups_event_id_billing_position_idx" ON "event_lineups"("event_id", "billing_position");

CREATE TABLE "ticket_options" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "provider" "ticket_provider" NOT NULL,
    "tier_name" VARCHAR(120) NOT NULL,
    "price_minor" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    "availability" "ticket_availability" NOT NULL DEFAULT 'available',
    "purchase_url" TEXT NOT NULL,
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ticket_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_options_price_non_negative" CHECK ("price_minor" IS NULL OR "price_minor" >= 0)
);

CREATE UNIQUE INDEX "ticket_options_event_id_provider_tier_name_key" ON "ticket_options"("event_id", "provider", "tier_name");
CREATE INDEX "ticket_options_event_id_idx" ON "ticket_options"("event_id");

-- ─────────────────────────── Users ───────────────────────────

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_uid" VARCHAR(128),
    "handle" VARCHAR(30) NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "avatar" TEXT,
    "home_lat" DOUBLE PRECISION,
    "home_lng" DOUBLE PRECISION,
    "home_city" VARCHAR(120),
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "onboarded_at" TIMESTAMPTZ(6),
    "onboarding_genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletion_requested_at" TIMESTAMPTZ(6),
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "banned_at" TIMESTAMPTZ(6),
    "ban_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_auth_uid_key" ON "users"("auth_uid");
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "follows" (
    "user_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("user_id", "artist_id")
);

CREATE INDEX "follows_artist_id_idx" ON "follows"("artist_id");

CREATE TABLE "attendances" (
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "state" "attendance_state" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("user_id", "event_id")
);

CREATE INDEX "attendances_event_id_state_idx" ON "attendances"("event_id", "state");

CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "event_id" UUID,
    "score" INTEGER NOT NULL,
    "review_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 5)
);

CREATE INDEX "ratings_artist_id_event_id_idx" ON "ratings"("artist_id", "event_id");
CREATE INDEX "ratings_user_id_idx" ON "ratings"("user_id");
-- One general rating per user per artist...
CREATE UNIQUE INDEX "ratings_user_artist_general_key" ON "ratings"("user_id", "artist_id") WHERE "event_id" IS NULL;
-- ...and one live-performance rating per user per event.
CREATE UNIQUE INDEX "ratings_user_event_live_key" ON "ratings"("user_id", "event_id") WHERE "event_id" IS NOT NULL;

-- ─────────────────────────── Social ───────────────────────────

CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "body" VARCHAR(2000) NOT NULL,
    "tag" "comment_tag" NOT NULL DEFAULT 'none',
    "thread" "comment_thread" NOT NULL DEFAULT 'planning',
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "moderation_state" "moderation_state" NOT NULL DEFAULT 'visible',
    "scam_score" INTEGER NOT NULL DEFAULT 0,
    "scam_signals" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comments_body_not_blank" CHECK (length(btrim("body")) > 0)
);

CREATE INDEX "comments_event_id_thread_created_at_idx" ON "comments"("event_id", "thread", "created_at");
CREATE INDEX "comments_event_id_thread_tag_created_at_idx" ON "comments"("event_id", "thread", "tag", "created_at");
CREATE INDEX "comments_event_id_thread_like_count_idx" ON "comments"("event_id", "thread", "like_count");
CREATE INDEX "comments_parent_comment_id_created_at_idx" ON "comments"("parent_comment_id", "created_at");
CREATE INDEX "comments_user_id_created_at_idx" ON "comments"("user_id", "created_at");
-- Rate limiting and duplicate-post detection scan a user's recent posts.
CREATE INDEX "comments_user_recent_idx" ON "comments"("user_id", "created_at" DESC) WHERE "deleted_at" IS NULL;

CREATE TABLE "comment_likes" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("comment_id", "user_id")
);

CREATE INDEX "comment_likes_user_id_idx" ON "comment_likes"("user_id");

CREATE TABLE "comment_reports" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "report_reason" NOT NULL,
    "detail" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "moderator_id" UUID,
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "comment_reports_comment_id_reporter_id_key" ON "comment_reports"("comment_id", "reporter_id");
CREATE INDEX "comment_reports_status_created_at_idx" ON "comment_reports"("status", "created_at");

-- ─────────────────────── Platform plumbing ───────────────────────

CREATE TABLE "push_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_outbox_dedupe_key_key" ON "notification_outbox"("dedupe_key");
CREATE INDEX "notification_outbox_status_scheduled_at_idx" ON "notification_outbox"("status", "scheduled_at");

CREATE TABLE "artist_claims" (
    "id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_claims_artist_id_user_id_key" ON "artist_claims"("artist_id", "user_id");

CREATE TABLE "ingestion_runs" (
    "id" UUID NOT NULL,
    "source" "event_source" NOT NULL,
    "tier" VARCHAR(16) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "deduped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ingestion_runs_source_started_at_idx" ON "ingestion_runs"("source", "started_at");

-- ─────────────────────── Foreign keys ───────────────────────

ALTER TABLE "artist_aliases" ADD CONSTRAINT "artist_aliases_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_primary_artist_id_fkey" FOREIGN KEY ("primary_artist_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_lineups" ADD CONSTRAINT "event_lineups_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_lineups" ADD CONSTRAINT "event_lineups_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_options" ADD CONSTRAINT "ticket_options_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "follows_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendances" ADD CONSTRAINT "attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD CONSTRAINT "comments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "artist_claims" ADD CONSTRAINT "artist_claims_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artist_claims" ADD CONSTRAINT "artist_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────── Growth, retention and compliance (spec section 10) ───────────────

CREATE TABLE "user_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "consent_type" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "policy_version" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- The latest row per (user, type) is authoritative; the rest is the audit trail
-- POPIA expects us to be able to produce.
CREATE INDEX "user_consents_user_id_type_created_at_idx" ON "user_consents"("user_id", "type", "created_at");

CREATE TABLE "referral_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "invitee_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id"),
    -- Nobody refers themselves.
    CONSTRAINT "referrals_not_self" CHECK ("inviter_id" <> "invitee_id")
);

-- One redemption per invitee, enforced by the database rather than by a check
-- that races under concurrent signups.
CREATE UNIQUE INDEX "referrals_invitee_id_key" ON "referrals"("invitee_id");
CREATE INDEX "referrals_inviter_id_idx" ON "referrals"("inviter_id");

CREATE TABLE "user_badges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "streak_months" INTEGER NOT NULL,
    "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_badges_user_id_code_key" ON "user_badges"("user_id", "code");

CREATE TABLE "ticket_clicks" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "ticket_option_id" UUID NOT NULL,
    "user_id" UUID,
    "provider" "ticket_provider" NOT NULL,
    "surface" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_clicks_event_id_created_at_idx" ON "ticket_clicks"("event_id", "created_at");
CREATE INDEX "ticket_clicks_provider_created_at_idx" ON "ticket_clicks"("provider", "created_at");

CREATE TABLE "ticket_price_snapshots" (
    "id" UUID NOT NULL,
    "ticket_option_id" UUID NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_price_snapshots_ticket_option_id_observed_at_idx" ON "ticket_price_snapshots"("ticket_option_id", "observed_at");

ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_clicks" ADD CONSTRAINT "ticket_clicks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_clicks" ADD CONSTRAINT "ticket_clicks_ticket_option_id_fkey" FOREIGN KEY ("ticket_option_id") REFERENCES "ticket_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_clicks" ADD CONSTRAINT "ticket_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_price_snapshots" ADD CONSTRAINT "ticket_price_snapshots_ticket_option_id_fkey" FOREIGN KEY ("ticket_option_id") REFERENCES "ticket_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Person-to-person follows, backing Group Plans.
CREATE TABLE "user_follows" (
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("follower_id", "followee_id"),
    CONSTRAINT "user_follows_not_self" CHECK ("follower_id" <> "followee_id")
);

CREATE INDEX "user_follows_followee_id_idx" ON "user_follows"("followee_id");

ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
