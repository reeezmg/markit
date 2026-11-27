# Storefront CRM rollout

## Dedicated sales CRM

The new `/crm` workspace is separate from the storefront email tools below. See
`docs/ARCH-crm.md` for its contracts. Its new database prerequisite is the prepared
`20261118220000_dedicated_crm` migration creating six CRM tables and adding three CompanyClient columns. Applying it requires
a separate explicit instruction under AGENTS.md after preparation in `schema.zmodel`.
Implementation, generation and tests never install it. Do not apply every pending migration.

After separately authorized installation, deploy the matching generated Prisma,
enhancer, Zod and query-hook output and restart the application. Deploy the protected
15-minute `/api/cron/crm` schedule with the existing private `CRON_SECRET`; it creates
internal company alerts and sends no customer email or WhatsApp messages. Managers
configure pipelines, sources, custom fields, scoring and follow-ups. Staff use the existing /client page for new leads and contacts. Existing memberships
appear directly in CRM; there is no separate contact import or consent enrollment.
The raw CRM membership fields use @ignore so generated client queries remain
compatible before installation.

Verify with `npm run test:crm`, `npm run test:crm:mobile` and the read-only
`node --import tsx scripts/check-crm-readiness.ts`. New CRM write SQL uses isolated
test adapters until installation is authorized. Real provider delivery remains a
separate email/WhatsApp onboarding check.

### Removing CRM business accounts

The account-free code works with the old physical account columns still present.
Deploy it before separately authorizing the locally prepared
`20261123190000_remove_crm_business_accounts` migration. This drops the CRM account
table and its three association columns, and cleans account scoring/segment filters.
It preserves client identities, deals, tasks and historical audits. Refresh the
read-only backup with `node --import tsx scripts/backup-crm-business-accounts.ts`
from Storetools before application, retain the ignored snapshot, and inspect inbound
constraints. No schema application is performed by that script. Do not replay the
historical CRM create-table migration on an installed database or use a broad push.
After application verify the old table/columns are absent, CRM readiness succeeds,
and client/deal/activity counts remain unchanged. The targeted removal was separately
authorized and applied on 23 November 2026 using
`node --import tsx scripts/apply-remove-crm-business-accounts.ts --apply`; locked
backup and record fingerprints passed. This runner previews without `--apply` and
does not register Prisma migration history. Do not reapply historical migrations. See `docs/ARCH-crm.md`.

## Existing storefront email marketing

The older email prerequisites below need their own separate database authorization.
Installing the sales CRM does not authorize those or any earlier WhatsApp migrations,
nor does it opt clients into campaigns.

The CRM is deliberately fail-closed: no campaign is sent until a manager queues a draft or enables an automation, a customer has confirmed the exact email address, and the scheduled processor is configured.

1. Apply the two CRM migrations under `prisma/migrations/20260913120000_add_company_client_marketing_consent/` and `20260913130000_add_storefront_crm/` to the shared PostgreSQL database through the normal migration pipeline **before** deploying either API. Do not run an unrestricted schema push against production.
2. Configure `ecommerce-api` with `PUBLIC_API_BASE_URL` (the HTTPS API origin) and the mailbox SMTP values listed in `ecommerce-api/.env.example`. Configure Storetools with the same mailbox plus `CRON_SECRET`, `MARKETING_LINK_SECRET` (32+ random characters), and `MARKETING_PUBLIC_BASE_URL` as shown in `marketing.env.example`. Keep secrets out of Git.
3. Deploy both APIs. The Storetools Vercel cron invokes `/api/ecommerce-cms/marketing/process` every five minutes and authenticates with `CRON_SECRET`. This schedule requires a Vercel plan supporting sub-daily cron jobs; on Hobby, use a daily schedule or an external scheduler with the same Bearer secret. A daily schedule materially delays automation and queue draining.
4. Verify with a dedicated test company and mailbox: subscribe without a checkbox (reject), subscribe with consent (pending), follow the email link and confirm (confirmed), queue a one-recipient test campaign, check the `SENT` job count and received email, then unsubscribe and verify subsequent jobs are suppressed. Test a revoked staff member and a customer ID from another company (both must be denied).
5. Before sending to real customers, verify sender-domain DNS and mailbox sending limits with the mail provider, add WAF/CAPTCHA protection to the public subscribe endpoint, review the subscription wording and privacy policy, and monitor failed jobs. The endpoint has a one-hour resend cooldown per customer, but that alone does not prevent bulk abuse across different addresses. Do not import or auto-consent historical customers.

Automatic emails are plain text, limited to five sends per processor run and one marketing email per customer per 24 hours. Abandoned-cart reminders are suppressed after purchase and limited to one per seven days. The processor retries transient errors up to three attempts; `FAILED` jobs need manual investigation. SMTP has no provider-side idempotency key, so a failure after SMTP acceptance but before the database records `SENT` can theoretically cause a duplicate on retry. Use a transactional email provider with idempotency support for stronger exactly-once delivery.

SMTP also provides no bounce/complaint webhook in this integration. Until a provider with event webhooks is connected, operators must monitor mailbox delivery failures and stop campaigns for addresses that bounce or complain. Do not treat the `SENT` job state as proof of inbox delivery.
