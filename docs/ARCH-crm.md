# Dedicated sales CRM

## Navigation and client ownership

`layouts/default.vue` has a CRM section for admin, manager, user, biller and accountant staff. Reports and settings require admin/manager access. Campaigns has been removed from the CRM menu; its old page redirects to the overview. CRM has one **Clients / leads** link opening `/client?from=crm`; that query keeps CRM selected in the sidebar. There is no separate lead/contact directory or contact table. The former `/crm/leads` route redirects to this page, retaining query context. The overview's Active leads card opens the shared directory too.

`pages/client/index.vue` remains the single contact directory, Add Client flow, identity editor, membership activation/deactivation and company-transfer owner. In CRM mode, selecting a client name opens `CRM/ClientPanel.vue` in a slideover on the same page; the existing **CRM details** row action remains available. Deep links use `crmClient=:clientId&entryCompany=:companyId&from=crm`. ClientPanel creates an authorized form company scope and shows the existing client's CRM context. The directory retains existing search/status filters and membership pagination; qualification, owner, source, tags, score, deals and activities are viewed/edited in the CRM panel.

Business accounts are removed from CRM forms, context links, task prefills, filters, lead scoring and record APIs. Both old account page routes still redirect to the shared directory with company/client query context preserved; `/api/crm/accounts` and its subpaths return 410. Clients, deals and activities link directly without an account association. Finance/accounts features are independent and unchanged.

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

Authoritative models are `CrmSettings`, `CrmDeal`, `CrmActivity`, `CrmDocumentLink` and `CrmAudit` in `schema.zmodel`. There is no `CrmContact` model. Deals and activities reference the existing `CompanyClient` composite `companyId/clientId` key directly.

Two fields extend `CompanyClient`: `crmData` JSON contains only company-local CRM attributes and timestamps, and `crmVersion` provides optimistic concurrency. CRM JSON never duplicates name, phone, email or marketing consent. These raw-API fields use `@prisma.passthrough("@ignore")` in the zmodel, producing Prisma `@ignore`: physical columns remain in the generated schema while generated client operations exclude them. ZenStack's bare `@ignore` removes fields from the generated physical schema and must not be used for these columns. The retired `CrmAccount`, `CompanyClient.crmAccountId` and deal/activity account relations are removed from the authoritative and generated local schemas.

The locally prepared `20261123190000_remove_crm_business_accounts` migration drops `crm_accounts`, `company_clients.crm_account_id`, `crm_deals.account_id` and `crm_activities.account_id`, and removes account scoring/segment-filter settings. It preserves clients, deals, tasks, other settings and append-only audit history. Generation, tests and runtime never apply this migration. On 23 November 2026, after source preparation and the user's separate removal instruction, `scripts/apply-remove-crm-business-accounts.ts --apply` applied only this removal to the configured database. Its locked transaction saved a fresh backup and verified the table/columns and retired settings were absent, CRM readiness passed, and fingerprints of clients, memberships (excluding the removed field), deals, activities and audit records were unchanged. The local before/verification/commit artifacts are under ignored `.cache/crm-business-account-removal/`. It did not register Prisma migration history or replay earlier migrations. Run `node --import tsx scripts/backup-crm-business-accounts.ts` from Storetools immediately before any separately authorized application: it reads a repeatable, read-only snapshot of accounts, linked rows, settings and inbound constraints into ignored `.cache/crm-business-account-removal/<timestamp>/before.json`. It performs no database writes. The application runner previews by default; `--apply` requires task-specific authorization and backs up again under locks. Deploy the account-free code before applying; old schema columns can remain temporarily because active CRM SQL no longer references them. Readiness requires the five remaining CRM tables and two membership metadata columns.

`crmClientSource` in `server/utils/crm.ts` is an inline SELECT over Client + CompanyClient, not a new table or database view. It returns canonical identity with company CRM attributes. Existing memberships appear immediately without import/linking. Until explicitly enriched, lifecycle/qualification derive from the existing flat pipeline stage; unassigned memberships may be claimed by eligible staff. CRM saves do not change that legacy pipeline, membership status, points or identity.

`crm-access.ts` rechecks live staff membership and company access. Writes require the same origin. Staff edit work they own/created and may claim unassigned client CRM attributes; managers control settings, reports, campaigns, archiving of CRM work and bulk assignment. CRM does not merge, archive, create or transfer client identities. Existing client-page operations retain those responsibilities.

Writes use a company advisory lock, a transaction, optimistic versions and append-only audit evidence. Foreign references are checked in the selected company. New deal/activity foreign keys additionally enforce company membership. Missing CRM tables or membership columns return a setup state/503; no runtime code installs a schema.

CRM action success/failure feedback uses the shared Nuxt UI toast service across
workspace actions, record saves and settings. Load/access errors and contextual
lookup/import validation remain beside the affected content. Successful record
saves toast in the shared editor so client-page task forms receive the same feedback.

## Activities table

`/crm/activities` uses `CRM/ActivitiesTable.vue` inside the existing workspace,
following `/erp/sales`: compact page heading, underlined view tabs, a Nuxt UI card,
search/filter header, rows-per-page selector, column chooser, CSV export, a selectable
`UTable` and numbered pagination with the current result range. All/Open/Overdue/
Completed views map to the existing status/due API filters. Search waits 250ms;
Enter runs immediately. Owner/due shortcuts and detailed type, priority, segment,
due-date and archive filters use the existing company-scoped list API. Changing a
view/filter/page size resets pagination, and out-of-range pages clamp after mutations.
Dates display in India time; overdue work is marked red. Column choices affect only
the displayed table, not exports or stored records. The table uses a fixed layout
within the available width: activity/type/segment, client/deal/owner, due date/time
with status/priority, and compact action icons. On narrow screens client/deal/owner
move into the activity cell. Long labels truncate with ellipses and full-text titles;
column selection still fits the available width.

Subject links open the existing activity editor, including read-only access to
another owner's work. Eligible owners/managers retain Complete; row menus provide
view/edit and manager archive/restore. Managers can select rows for existing bulk
assignment/archive/restore. Client, deal and saved-segment links retain company
context. Calendar and the other CRM lists retain their existing layouts. The table
adds no database models, migrations or new API endpoints.

## Client CRM updates and work

CRM POST creation of clients is rejected. New enquiries use **Add / manage clients**, opening the existing client page. CRM PUT accepts only company CRM attributes for an existing active membership. Attempts to change identity or reassign its client ID are rejected. Identity changes made on the client page are reflected on the next CRM read, including historical phone formats.

CSV updates require an explicit existing `clientId` and name. Preview/commit validate the same company, ownership, identity consistency, duplicate IDs and required custom values; commit is atomic. Files update up to 200 memberships and never create contacts. Custom columns use `custom:Field label`; numeric zero and explicit false are retained. Reimport accepts the exact formula-safe export of saved identity, source, tag and custom values (including international phones and negative numbers). It restores only a matching saved value; literal apostrophes remain intact and changed contact identities remain rejected. Filtered exports include client IDs/custom columns, escape formulas and cap at 5,000 matches with a notice.

Settings cannot remove a pipeline/stage in use or change its outcome. Won is 100%, lost is 0% and requires a reason; reopening clears closure. Deal outcomes never post sales, stock or accounting entries. Document links validate company and the deal's client.

First CRM enrichment of a lead and newly won deals can create configured follow-up tasks. Completing recurring work creates one next task. Stable recurrence keys prevent duplicates. The protected `/api/cron/crm` schedule runs every 15 minutes with `CRON_SECRET` and produces existing internal SYSTEM_ALERT notifications, never customer messages.

**Contextual tasks:** `/client` offers Add task in staff row actions and the CRM-mode toolbar. `CRM/TaskComposer.vue` establishes the selected row's authorized company scope before loading the shared activity editor, prefilling the client. Client CRM details, deal details and pipeline/table rows also offer Add task; deal actions prefill the deal/client. Segments offers Add task and Add task for segment after selecting a saved segment. These create one ordinary TASK, not tasks for every segment member. The activity editor can link a task/activity to a company-local saved segment independently of its client or deal. Tasks and Calendar share these records. Tasks supports a Segment filter; View segment tasks opens that filter, and task rows link back to the saved segment.

Segment references use the existing activity `attachments` JSON column: legacy reference arrays still read normally; linked activities store `{version:1,references:[{name,url}],segmentKey,segmentName}`. Raw API responses flatten this back to `attachments`, `segmentKey` and `segmentName`. The settings lookup validates new segment links within the selected company. Repeating tasks copy their segment and HTTPS references. Removing a saved segment preserves historical task labels and links; ordinary edits can retain or clear that historical link, while new tasks cannot choose a removed segment. This JSON contract is recorded in `schema.zmodel`; no physical schema change or migration is required.

The shared editor's linked-record search handles native input, paste, clear, change and composition updates directly, including intermediate composed text; it does not wait for Vue text-model composition to finish. Search is debounced by 250ms and searches clients (name/email/phone) and deals (name/description) within the selected company. It shows loading, lookup errors, no-match feedback and clickable results. Enter/Search runs immediately; only the newest response can update choices. Selecting a result updates the link dropdown and preserves that choice if another search filters it out. Selecting a deal can prefill its client. Client CRM-attribute editing has no linked-record search. Account scoring and account-based saved-segment filters are ignored when reading old settings and removed on settings saves; no account-based score contribution remains.

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

## Sales funnel

`pages/crm/funnel.vue` opens `CRMWorkspace` with section `funnel`. The sidebar and
workspace restrict it to administrators/managers, matching the existing reports API.
`components/CRM/Funnel.vue` reuses `/api/crm/reports` pipeline aggregates, with a
pipeline selector and deal-created date filters. Configured stages remain in order,
including zero-count stages; unmatched historical stages appear as previous stages.
Bars show current-stage counts, share, value and average stage age. Summary cards
show total/open/won/lost counts and won / (won + lost) win rate, with no rate for
zero closed deals. This is explicitly a current-state snapshot, not historical
stage conversion or collected revenue. Archived open deals are excluded by the
existing reports query; closed outcomes remain included. No schema changes.

## Verification and deployment

`tests/crm.test.ts` uses an isolated DML adapter for membership metadata, company boundaries, client identity preservation, versioning, import, deals, tasks, reminders and real HTTP guards. `tests/run-crm-browser.mjs` mounts real CRM components and ClientPanel with mocked APIs at desktop/mobile sizes. Existing client page/sidebar compilation is checked separately.

The revised `20261118220000_dedicated_crm` migration describes six CRM tables and three columns plus an account foreign key on existing CompanyClient. On 2026-11-19, the user authorized generation and `prisma db push`. Read-only diff inspection found the six tables already installed; the push added only the three membership columns and their composite account foreign key. The application's live `crmReady` check returned true. This was a schema push, not execution or migration-history registration of the prepared SQL file. No test creates schemas or sends customer messages. `scripts/verify-crm-schema.ts` runs the same readiness check read-only against the configured database.

Future database schema applications still require explicit instruction under AGENTS.md. Do not blindly execute the prepared create-table migration against this installed database. Earlier WhatsApp/marketing migrations are not implicitly authorized by the CRM work.

### Authorized persistent CRM flow audit

`scripts/test-crm-live.ts` exercises the real CRM HTTP handler and PostgreSQL DML
with an injected session for an existing active company administrator/manager. It
requires `--execute`, an exact `--company-id` and `--company-name`; persistent use
requires task-specific user authorization. Before writes it stores company CRM and
membership snapshots plus original sales/inventory fingerprints in ignored
`.cache/crm-audit/<batch>/before.json`. Labelled CRM-QA clients, a separate pipeline,
segments, deals, tasks and quotation/order test sources remain in the database.
Source-state changes affect only manifest-owned test documents and are backed up.
The harness does not install schemas, issue invoices, take payments or send messages.
Only internal CRM notifications are exercised. Invoice payment-rule transitions and
staff-role variations remain covered by the isolated CRM tests.

Checks cover client lifecycle/qualification combinations, imports/exports, deal
stages/outcomes/reopening, concurrent/stale edits, archive/restore atomicity,
activity kinds/priorities/statuses, context links, recurrence, segment/date filters,
reminders, quotation/order rules, document ownership, context and reports. Every
completed group checkpoints to `artifacts/crm-audit/<batch>/report.json` at repository
root. `--resume <report>` reuses the batch after a test fix or connection failure.
`--direct` uses the same database's direct Neon endpoint only inside this harness;
application environment/connection configuration is unchanged.

`scripts/crm-live-browser-bridge.ts <report>` binds loopback and serves the same real
handler with the supplied administrator context, backed by the retained database
records. It backs up the CRM records again and permits browser writes only to QA
deals/activities. Set `CRM_LIVE_BRIDGE` to its printed URL and run
`node tests/run-crm-browser.mjs` (optionally `--mobile`) to use
`tests/crm-live-browser.html`. Browser checks cover contextual task/deal creation,
segments, calendar, funnel, reports and settings, with persisted readback. The full
Nuxt shell, login screen and external communications are not simulated as tested.
The overview enquiry action opens the existing shared client page, matching the
client-directory rule; it no longer calls the retired lead editor.

`node --import tsx scripts/verify-crm-live.ts <report>` performs a fresh read-only
verification of retained record IDs, disabled QA rules and original fingerprints,
including inventory counts and absence of invoices for QA clients/sources. Additions
outside the harness are identified by source IDs/numbering and invoice ownership,
reported separately, and left untouched. It records the final counts
and verification result in the local report without changing database records.
