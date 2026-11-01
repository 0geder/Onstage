-- "Watch live": where a show is broadcast, for fans who cannot be there.
ALTER TABLE "events" ADD COLUMN "livestream_links" JSONB NOT NULL DEFAULT '{}';
