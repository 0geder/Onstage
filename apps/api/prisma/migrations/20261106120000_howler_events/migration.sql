-- Howler as an event source, fed by its Event Webhook.
ALTER TYPE "event_source" ADD VALUE 'howler';

CREATE TABLE "howler_events" (
    "howler_event_id" INTEGER NOT NULL,
    "organiser_id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "modified_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "howler_events_pkey" PRIMARY KEY ("howler_event_id")
);

CREATE INDEX "howler_events_starts_at_idx" ON "howler_events"("starts_at");
