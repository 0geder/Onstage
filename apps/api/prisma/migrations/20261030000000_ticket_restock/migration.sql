-- "Tickets are back" alerts: when a sold-out tier last came back on sale.
ALTER TABLE "ticket_options" ADD COLUMN "restocked_at" TIMESTAMPTZ(6);
