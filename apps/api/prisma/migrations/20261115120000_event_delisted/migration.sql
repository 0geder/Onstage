-- Listings that vanished from their ticketing source. Not a cancellation:
-- the event is hidden from discovery but still reachable by its link.
ALTER TABLE "events" ADD COLUMN "delisted_at" TIMESTAMPTZ(6);

-- How many events each ingestion run retired.
ALTER TABLE "ingestion_runs" ADD COLUMN "delisted" INTEGER NOT NULL DEFAULT 0;
