-- Sign in with Apple refresh tokens, revoked by the worker on account deletion.
CREATE TABLE "apple_credentials" (
    "user_id" UUID NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "apple_credentials_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "apple_credentials" ADD CONSTRAINT "apple_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
