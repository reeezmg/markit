ALTER TABLE "variant_inputs"
ADD COLUMN "shades" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "items"
ADD COLUMN "shade" TEXT;
