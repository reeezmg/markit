-- Local preparation only. Apply only after separate explicit authorization.
ALTER TABLE "ecomm_pickup_requests"
  ADD COLUMN "requested_pickup_date" TEXT,
  ADD COLUMN "requested_pickup_time" TEXT,
  ADD COLUMN "carrier_schedule" JSONB,
  ADD COLUMN "carrier_response" JSONB;

-- Historical values were the submitted request, not a confirmed carrier slot.
UPDATE "ecomm_pickup_requests"
SET "requested_pickup_date" = "pickup_date",
    "requested_pickup_time" = "pickup_time";
