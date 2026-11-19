# Dedicated sales CRM

## Navigation and client ownership

`layouts/default.vue` has a CRM section for admin, manager, user, biller and accountant staff. Campaigns, reports and settings require admin/manager access. CRM's **Clients / contacts** link opens the existing `/client?from=crm` page; that query keeps CRM selected in the sidebar. There is no separate contact list/detail route or contact table.

`pages/client/index.vue` remains the single contact directory, Add Client flow, identity editor, membership activation/deactivation and company-transfer owner. Its **CRM details** action opens `CRM/ClientPanel.vue` in a slideover on that same page. Deep links use `crmClient=:clientId&entryCompany=:companyId&from=crm`. ClientPanel creates an authorized form company scope and shows the existing client's CRM context.

| Page | Behavior |
|---|---|
| `/crm` | Leads, opportunities, forecast, overdue work and recent changes |
| `/crm/leads` | Existing company clients classified as leads; qualification, scores, owners, sources and tags |
| `/client?from=crm` | Existing client page, including add/edit/activation and CRM-details slideover |
| `/crm/accounts`, `/:accountId` | Business accounts and related existing clients/work |
| `/crm/deals`, `/:dealId` | Configurable pipeline board/table, outcomes, values, expected close and document links |
| `/crm/activities` | Tasks and call/meeting/email/WhatsApp/note logs, due dates, recurrence and HTTPS references |
| `/crm/calendar` | Six-week activity calendar using India dates |
| `/crm/segments` | Saved dynamic filters over existing company clients |
| `/crm/campaigns` | Existing confirmed-email audiences and campaign controls |
| `/crm/reports` | Forecast, stage aging, team outcomes, source conversion and loss reasons |
| `/crm/settings` | Pipelines, sources, tags, custom fields, scoring and internal follow-ups |

`pages/crm.vue` owns the CRM form company scope. Company changes do not alter authentication cookies. `Workspace.vue` renders CRM work lists and embedded client context; `RecordEditor.vue` edits CRM attributes only for existing clients. Client names are read-only there; email and phone are read from the canonical Client and edited on the existing client page.

## Persistence and authorization

Authoritative models are `CrmSettings`, `CrmAccount`, `CrmDeal`, `CrmActivity`, `CrmDocumentLink` and `CrmAudit` in `schema.zmodel`. There is no `CrmContact` model. Deals and activities reference the existing `CompanyClient` composite `companyId/clientId` key directly.

Three prepared fields extend `CompanyClient`: `crmData` JSON contains only company-local CRM attributes and timestamps, `crmVersion` provides optimistic concurrency, and `crmAccountId` links a business account. CRM JSON never duplicates name, phone, email or marketing consent. These raw-API fields and the account relation use `@ignore` so generated Prisma operations do not select new columns before installation or expose a generic CRM mutation path. The authoritative source still records their physical contract.

`crmClientSource` in `server/utils/crm.ts` is an inline SELECT over Client + CompanyClient, not a new table or database view. It returns canonical identity with company CRM attributes. Existing memberships appear immediately without import/linking. Until explicitly enriched, lifecycle/qualification derive from the existing flat pipeline stage; unassigned memberships may be claimed by eligible staff. CRM saves do not change that legacy pipeline, membership status, points or identity.

`crm-access.ts` rechecks live staff membership and company access. Writes require the same origin. Staff edit work they own/created and may claim unassigned client CRM attributes; managers control settings, reports, campaigns, archiving of CRM work and bulk assignment. CRM does not merge, archive, create or transfer client identities. Existing client-page operations retain those responsibilities.

Writes use a company advisory lock, a transaction, optimistic versions and append-only audit evidence. Foreign references are checked in the selected company. New deal/activity foreign keys additionally enforce company membership. Missing CRM tables or membership columns return a setup state/503; no runtime code installs a schema.

## Client CRM updates and work

CRM POST creation of clients is rejected. New enquiries use **Add / manage clients**, opening the existing client page. CRM PUT accepts only company CRM attributes for an existing active membership. Attempts to change identity or reassign its client ID are rejected. Identity changes made on the client page are reflected on the next CRM read, including historical phone formats.

CSV updates require an explicit existing `clientId` and name. Preview/commit validate the same company, ownership, identity consistency, duplicate IDs and required custom values; commit is atomic. Files update up to 200 memberships and never create contacts. Custom columns use `custom:Field label`; numeric zero and explicit false are retained. Filtered exports include client IDs/custom columns, escape formulas and cap at 5,000 matches with a notice.

Settings cannot remove a pipeline/stage in use or change its outcome. Won is 100%, lost is 0% and requires a reason; reopening clears closure. Deal outcomes never post sales, stock or accounting entries. Document links validate company and the deal's client.

First CRM enrichment of a lead and newly won deals can create configured follow-up tasks. Completing recurring work creates one next task. Stable recurrence keys prevent duplicates. The protected `/api/cron/crm` schedule runs every 15 minutes with `CRON_SECRET` and produces existing internal SYSTEM_ALERT notifications, never customer messages.

## Commercial context and communication

Embedded client context reads company-owned invoices, quotes, ecommerce orders, registered products and earlier storefront activities (up to 50/type). After-sales reads/links honor `includeAfterSales`. Invoices and quotations open existing editors; orders have a scoped summary. CRM detail work/audit lists cap at 100; main lists are paginated and calendar loads at most 5,000 events with a notice.

Email and WhatsApp activities are conversation logs, not mailbox synchronization or outbound sends. HTTPS references are links rather than binary uploads. Manual WhatsApp links and Connect permission controls remain available. CRM changes never grant consent. Campaign routes reuse existing authorized, subscribed-email marketing handlers and supported audiences; saved CRM segments are not campaign recipient audiences.

## Verification and deployment

`tests/crm.test.ts` uses an isolated DML adapter for membership metadata, company boundaries, client identity preservation, versioning, import, deals, tasks, reminders and real HTTP guards. `tests/run-crm-browser.mjs` mounts real CRM components and ClientPanel with mocked APIs at desktop/mobile sizes. Existing client page/sidebar compilation is checked separately.

The revised `20261118220000_dedicated_crm` migration creates six CRM tables and adds three columns plus an account foreign key to existing CompanyClient. It is locally prepared and unapplied. No test creates schemas or sends customer messages. Read-only Blue Nest checks exercise existing commercial history and the client projection with virtual default CRM columns when installation is pending.

Applying this migration requires a separate explicit instruction under AGENTS.md. Apply only this reviewed migration after authorization, deploy matching generated code and verify live CRM writes. Earlier WhatsApp/marketing migrations are not implicitly authorized.
