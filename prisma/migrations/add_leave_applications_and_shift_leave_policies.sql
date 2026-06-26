-- Migration: Add staff leave applications and per-shift paid leave policies.
DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'EARNED', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveAllowancePeriod" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS casual_leave_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS casual_leave_period "LeaveAllowancePeriod" NOT NULL DEFAULT 'MONTHLY'::"LeaveAllowancePeriod",
  ADD COLUMN IF NOT EXISTS sick_leave_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_leave_period "LeaveAllowancePeriod" NOT NULL DEFAULT 'MONTHLY'::"LeaveAllowancePeriod",
  ADD COLUMN IF NOT EXISTS earned_leave_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earned_leave_period "LeaveAllowancePeriod" NOT NULL DEFAULT 'YEARLY'::"LeaveAllowancePeriod",
  ADD COLUMN IF NOT EXISTS other_leave_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_leave_period "LeaveAllowancePeriod" NOT NULL DEFAULT 'MONTHLY'::"LeaveAllowancePeriod";

CREATE TABLE IF NOT EXISTS leave_applications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type "LeaveType" NOT NULL,
  custom_type TEXT,
  start_date TIMESTAMP(3) NOT NULL,
  end_date TIMESTAMP(3) NOT NULL,
  days DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  status "LeaveStatus" NOT NULL DEFAULT 'APPROVED'::"LeaveStatus",
  decision_note TEXT,
  decided_by_user_id TEXT,
  CONSTRAINT leave_applications_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT leave_applications_company_user_fkey FOREIGN KEY (company_id, user_id) REFERENCES company_users(company_id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS leave_applications_company_id_idx ON leave_applications(company_id);
CREATE INDEX IF NOT EXISTS leave_applications_company_user_idx ON leave_applications(company_id, user_id);
CREATE INDEX IF NOT EXISTS leave_applications_company_status_idx ON leave_applications(company_id, status);
CREATE INDEX IF NOT EXISTS leave_applications_company_date_idx ON leave_applications(company_id, start_date, end_date);
