-- Migration: Add configurable working days to shifts.
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS work_days TEXT[] NOT NULL DEFAULT ARRAY[
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY'
  ]::TEXT[];
