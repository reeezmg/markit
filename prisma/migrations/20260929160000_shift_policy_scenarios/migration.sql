-- Additive migration. Existing shifts retain legacy behavior until edited.
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "policy" JSONB;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "policy_history" JSONB;
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'COMP_OFF';
