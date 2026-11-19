# Dedicated sales CRM

## Navigation and client ownership

`layouts/default.vue` has a CRM section for admin, manager, user, biller and accountant staff. Reports and settings require admin/manager access. Campaigns has been removed from the CRM menu; its old page redirects to the overview. CRM has one **Clients / leads** link opening `/client?from=crm`; that query keeps CRM selected in the sidebar. There is no separate lead/contact directory or contact table. The former `/crm/leads` route redirects to this page, retaining query context. The overview's Active leads card opens the shared directory too.

`pages/client/index.vue` remains the single contact directory, Add Client flow, identity editor, membership activation/deactivation and company-transfer owner. In CRM mode, selecting a client name opens `CRM/ClientPanel.vue` in a slideover on the same page; the existing **CRM details** row action remains available. Deep links use `crmClient=:clientId&entryCompany=:companyId&from=crm`. ClientPanel creates an authorized form company scope and shows the existing client's CRM context. The directory retains existing search/status filters and membership pagination; qualification, owner, source, tags, score, deals and activities are viewed/edited in the CRM panel.

Business accounts no longer have a sidebar entry or standalone list/detail UI. Both old account routes redirect to the shared directory with company/client query context preserved. Existing account records, optional associations in CRM editors and API support remain intact; removing these pages performs no database changes.

| Page | Behavior |
|---|---|
| `/crm` | Leads, opportunities, forecast, overdue work and recent changes |
| `/crm/leads` | Compatibility redirect to `/client?from=crm`, preserving company/client query context |
| `/client?from=crm` | Single clients/leads directory, existing add/edit/activation and CRM-details slideover |
| `/crm/accounts`, `/:accountId` | Retired business account pages; redirect to `/client?from=crm`, retaining query context |
| `/crm/deals`, `/:dealId` | Configurable pipeline board/table, outcomes, values, expected close and document links |
| `/crm/activities` | Tasks and call/meeting/email/WhatsApp/note logs, due dates, recurrence and HTTPS references |
| `/crm/calendar` | Six-week activity calendar using India dates |
| `/crm/segments` | Saved dynamic filters over existing company clients |
| `/crm/campaigns` | Retired CRM Campaigns page; redirects to `/crm`, retaining query context |
| `/crm/reports` | Forecast, stage aging, team outcomes, source conversion and loss reasons |
| `/crm/settings` | Pipelines, sources, tags, custom fields, scoring and internal follow-ups |

`pages/crm.vue` owns the CRM form company scope. Company changes do not alter authentication cookies. `Workspace.vue` renders CRM work lists and embedded client context; `RecordEditor.vue` edits CRM attributes only for existing clients. Client names are read-only there; email and phone are read from the canonical Client and edited on the existing client page.

## Persistence and authorization

Authoritative models are `CrmSettings`, `CrmAccount`, `CrmDeal`, `CrmActivity`, `CrmDocumentLink` and `CrmAudit` in `schema.zmodel`. There is no `CrmContact` model. Deals and activities reference the existing `CompanyClient` composite `companyId/clientId` key directly.

Three fields extend `CompanyClient`: `crmData` JSON contains only company-local CRM attributes and timestamps, `crmVersion` provides optimistic concurrency, and `crmAccountId` links a business account. CRM JSON never duplicates name, phone, email or marketing consent. These raw-API fields and the account relation use `@prisma.passthrough("@ignore")` in the zmodel, producing Prisma `@ignore`: physical columns remain visible to `prisma db push` while generated client operations exclude them. The inverse account relation uses the same passthrough. ZenStack's bare `@ignore` removes fields from the generated physical schema and must not be used for these columns.

`crmClientSource` in `server/utils/crm.ts` is an inline SELECT over Client + CompanyClient, not a new table or database view. It returns canonical identity with company CRM attributes. Existing memberships appear immediately without import/linking. Until explicitly enriched, lifecycle/qualification derive from the existing flat pipeline stage; unassigned memberships may be claimed by eligible staff. CRM saves do not change that legacy pipeline, membership status, points or identity.

`crm-access.ts` rechecks live staff membership and company access. Writes require the same origin. Staff edit work they own/created and may claim unassigned client CRM attributes; managers control settings, reports, campaigns, archiving of CRM work and bulk assignment. CRM does not merge, archive, create or transfer client identities. Existing client-page operations retain those responsibilities.

Writes use a company advisory lock, a transaction, optimistic versions and append-only audit evidence. Foreign references are checked in the selected company. New deal/activity foreign keys additionally enforce company membership. Missing CRM tables or membership columns return a setup state/503; no runtime code installs a schema.

## Client CRM updates and work

CRM POST creation of clients is rejected. New enquiries use **Add / manage clients**, opening the existing client page. CRM PUT accepts only company CRM attributes for an existing active membership. Attempts to change identity or reassign its client ID are rejected. Identity changes made on the client page are reflected on the next CRM read, including historical phone formats.

CSV updates require an explicit existing `clientId` and name. Preview/commit validate the same company, ownership, identity consistency, duplicate IDs and required custom values; commit is atomic. Files update up to 200 memberships and never create contacts. Custom columns use `custom:Field label`; numeric zero and explicit false are retained. Filtered exports include client IDs/custom columns, escape formulas and cap at 5,000 matches with a notice.

Settings cannot remove a pipeline/stage in use or change its outcome. Won is 100%, lost is 0% and requires a reason; reopening clears closure. Deal outcomes never post sales, stock or accounting entries. Document links validate company and the deal's client.

First CRM enrichment of a lead and newly won deals can create configured follow-up tasks. Completing recurring work creates one next task. Stable recurrence keys prevent duplicates. The protected `/api/cron/crm` schedule runs every 15 minutes with `CRON_SECRET` and produces existing internal SYSTEM_ALERT notifications, never customer messages.

**Contextual tasks:** `/client` offers Add task in staff row actions and the CRM-mode toolbar. `CRM/TaskComposer.vue` establishes the selected row's authorized company scope before loading the shared activity editor, prefilling the client. Client CRM details, deal details and pipeline/table rows also offer Add task; deal actions prefill the deal/client/account. Segments offers Add task and Add task for segment after selecting a saved segment. These create one ordinary TASK, not tasks for every segment member. The activity editor can link a task/activity to a company-local saved segment independently of its client or deal. Tasks and Calendar share these records. Tasks supports a Segment filter; View segment tasks opens that filter, and task rows link back to the saved segment.

Segment references use the existing activity `attachments` JSON column: legacy reference arrays still read normally; linked activities store `{version:1,references:[{name,url}],segmentKey,segmentName}`. Raw API responses flatten this back to `attachments`, `segmentKey` and `segmentName`. The settings lookup validates new segment links within the selected company. Repeating tasks copy their segment and HTTPS references. Removing a saved segment preserves historical task labels and links; ordinary edits can retain or clear that historical link, while new tasks cannot choose a removed segment. This JSON contract is recorded in `schema.zmodel`; no physical schema change or migration is required.

## Commercial context and communication

### Sales / ERP deal rules

CRM Settings includes disabled-by-default sales rules with a name, event, pipeline,
optional starting open stage, target stage, forward-only option and an automatic loss
reason when targeting Lost. Events cover quotation SENT/ACCEPTED/DECLINED/EXPIRED,
sales order CONFIRMED/CLOSED/CANCELLED, invoice PAID/PENDING and invoice cancellation
or soft deletion. Rules change only the deal stage/outcome/probability and normal CRM
follow-ups/audit; source sales records, values, payments, stock and journals are not
modified. No rule is installed or enabled automatically.

`crm-sales-rules.ts` reads only explicit QUOTE/BILL/SALES_ORDER links. Ecommerce ORDER
links remain view-only for this automation. Multiple deals for one client are never
matched just by client identity. Linking validates the company/client and initializes
the enabled rules' observations. Saving a new, edited or re-enabled rule starts a new
server-generated revision and baselines its currently linked records; unrelated
settings saves retain the revision. This prevents replaying historical document states.

The existing protected `/api/cron/crm` job runs every 15 minutes and now includes
companies with CRM settings even when no tasks are due. Admin/managers can run saved
rules immediately with `POST /api/crm/sales-rules/run` from **Check rules now**. Both
paths use the existing company CRM advisory lock and transaction. This is observed
state automation, not a sales event stream: intermediate transitions between checks
can collapse to the latest state. Newly linked documents establish a baseline rather
than immediately matching their current state.

Only relevant status/payment transitions trigger rules. Each rule revision/link has
an append-only `CrmAudit` sales-rule observation cursor; unchanged/repeated checks do
nothing. Closed/archived deals, inactive owners/clients, mismatched document clients,
nonmatching pipeline/from-stage and same/backward stages (when forward-only) are
skipped with audit evidence. Rules run in their displayed priority order (movable earlier/later); the first applicable rule wins and one deal changes at most once per check. Overlapping
enabled rules for the same event/pipeline/from-stage are rejected. Automatic wins use
the usual follow-up logic and automatic losses require the configured reason. No
physical schema change, new table or migration is required; settings and audit JSON
contracts are recorded in `schema.zmodel`.

Embedded client context reads company-owned invoices, quotes, ecommerce orders, registered products and earlier storefront activities (up to 50/type). After-sales reads/links honor `includeAfterSales`. Invoices and quotations open existing editors; orders have a scoped summary. CRM detail work/audit lists cap at 100; main lists are paginated and calendar loads at most 5,000 events with a notice.

Email and WhatsApp activities are conversation logs, not mailbox synchronization or outbound sends. HTTPS references are links rather than binary uploads. Manual WhatsApp links and Connect permission controls remain available. CRM changes never grant consent. The CRM Campaigns page is retired. Underlying campaign API support and existing marketing data remain intact; saved CRM segments are not campaign recipient audiences.

## Verification and deployment

`tests/crm.test.ts` uses an isolated DML adapter for membership metadata, company boundaries, client identity preservation, versioning, import, deals, tasks, reminders and real HTTP guards. `tests/run-crm-browser.mjs` mounts real CRM components and ClientPanel with mocked APIs at desktop/mobile sizes. Existing client page/sidebar compilation is checked separately.

The revised `20261118220000_dedicated_crm` migration describes six CRM tables and three columns plus an account foreign key on existing CompanyClient. On 2026-11-19, the user authorized generation and `prisma db push`. Read-only diff inspection found the six tables already installed; the push added only the three membership columns and their composite account foreign key. The application's live `crmReady` check returned true. This was a schema push, not execution or migration-history registration of the prepared SQL file. No test creates schemas or sends customer messages. `scripts/verify-crm-schema.ts` runs the same readiness check read-only against the configured database.

Future database schema applications still require explicit instruction under AGENTS.md. Do not blindly execute the prepared create-table migration against this installed database. Earlier WhatsApp/marketing migrations are not implicitly authorized by the CRM work.
