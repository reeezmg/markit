# Shift policy rollout

The scenario update adds nullable JSONB `shifts.policy` and `shifts.policy_history`, plus
the `COMP_OFF` LeaveType enum value. Existing settings remain intact. No rotating or
split-shift scheduler is included.

Apply the additive migration to the intended database before starting the updated app.
From `storetools`, to execute only this feature's migration (without replaying unrelated
historical migrations):

```powershell
npx prisma db execute --file prisma/migrations/20260929160000_shift_policy_scenarios/migration.sql --schema prisma/schema.prisma
npx zenstack generate
```

The SQL is idempotent. Use the project's normal migration tracking if deploying with
`prisma migrate deploy`. Restart the app after generation. The implementation session
does not apply this migration to an external database.

In Users > Shifts, edit a policy and choose its effective date. The previous settings
are captured as a baseline. Versions cannot be backdated or overwritten; each later
save must use a later date. This preserves earlier shift rules on payroll reruns, but
cannot recover changes made before version history existed.

Break and attendance classification defaults preserve the previous calculation.
Enable type-specific leave allowances to use approved applications rather than the
generic per-cycle allowance. Record leave and review balances at `/users/leaves`.
Holiday/weekly-off hourly rates are **extra pay**, additional to normal base salary;
compensatory leave credits are calculated from completed qualifying attendance.
Typed allowances reset each calendar period without carry-forward. Half-day leave
is supported; use the decision note to describe which portion of the day is leave.

Validation:

```powershell
npm test
npx tsx tests/attendance-write.test.ts
node scripts/check-db-meta.mjs
```

The payroll runner computes and validates all staff days before creating/updating a
cycle shell, so a missing-checkout REVIEW policy does not save a partially calculated
cycle. Existing ledger/payout posting behavior is unchanged. After changing attendance
or approved leave, recalculate the relevant payroll cycle through the normal UI.
