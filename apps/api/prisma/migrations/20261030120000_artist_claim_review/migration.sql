-- Claim-your-profile review: the official link a claimant offers as proof,
-- which operator decided the claim, and an index for the pending queue.
ALTER TABLE "artist_claims" ADD COLUMN "contact_url" TEXT;
ALTER TABLE "artist_claims" ADD COLUMN "reviewed_by" UUID;

CREATE INDEX "artist_claims_status_created_at_idx" ON "artist_claims"("status", "created_at");

ALTER TABLE "artist_claims" ADD CONSTRAINT "artist_claims_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
