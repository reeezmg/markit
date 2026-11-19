# Connect / WhatsApp Business

`layouts/default.vue` shows **Connect** in expanded and collapsed sidebars for
administrators/managers when the company selects it and WhatsApp Business under
Settings → Sidebar. Connect defaults to disabled; direct access remains at
`/connect/whatsapp`. See `ARCH-sidebar-navigation.md`. `pages/connect.vue`
owns the single-company form scope and company selector; the workspace inherits
that scope and remounts on company changes. A company administrator or manager is required in
both the page and every seller API. Direct access is independent of the plan menu.
`utils/connect-access.ts` supplies the shared page/API role policy. Staff, billers,
accountants and investors do not receive Connect access. Company authorization
remains enforced independently of this role check.

Implementation: `components/Connect/WhatsAppWorkspace.vue`,
`server/utils/connect-whatsapp.ts`, `server/utils/connect-whatsapp-security.ts`,
`server/api/connect/whatsapp/[action].ts`, and the separate signed webhook route.

## Current deployment boundary

This is a local implementation. The prepared migration
`prisma/migrations/20261103120000_connect_whatsapp/migration.sql` has **not** been
applied by this work. It needs separate explicit database authorization under
`AGENTS.md`. Request handlers never create or alter database structures. The status
endpoint reports `schemaReady:false` until both prepared tables exist; other routes
return a setup error. No customer has been connected and no real message/template
has been sent/created during validation.

The authoritative schema is `schema.zmodel`. Generated Prisma schema/client output
is not hand edited. New runtime queries use the existing raw `pg` pool and do not
require the new models in the generated client. Run the normal schema generation
workflow when preparing deployment, independently of database application approval.

## Operator configuration

Set these private server environment variables in local `.env` and in the hosting
environment. Restart Nuxt after changing them. No App Secret, business token or
encryption key belongs in public Nuxt configuration or source control.

| Variable | Purpose |
|---|---|
| `WHATSAPP_APP_ID` | Meta developer app ID; returned to the signup SDK |
| `WHATSAPP_APP_SECRET` | App secret; token inspection/code exchange and webhook HMAC |
| `WHATSAPP_SIGNUP_CONFIG_ID` | Facebook Login for Business configuration ID for WhatsApp Embedded Signup |
| `WHATSAPP_ENCRYPTION_KEY` | Dedicated random secret of at least 32 characters; AES-256-GCM credential/cookie encryption |
| `WHATSAPP_CONNECT_VERIFY_TOKEN` | Random webhook verification string; enter the same value in Meta |
| `WHATSAPP_GRAPH_VERSION` | Optional Graph API version, default `v25.0`; keep compatible with the Meta app |
| `WHATSAPP_NOTIFICATION_ORIGIN` | Public Markit HTTPS origin for automatic invoice/quote links; no path or credentials |

Generate secrets through the hosting secret manager or a cryptographically secure
generator. Keep the encryption key stable and backed up securely; changing it
requires reconnecting credentials encrypted under the former key. Neither secret is
printed by the setup UI. The status endpoint returns only readiness booleans and
the public App ID/configuration ID/version.

In the Meta App Dashboard:

1. Configure the business app's WhatsApp product and Facebook Login for Business
   Embedded Signup configuration. Copy its **configuration ID**, distinct from the
   App ID, into `WHATSAPP_SIGNUP_CONFIG_ID`. Use Meta's currently supported signup
   configuration/variation. The browser launches configuration-based signup using
   `response_type:code`, `override_default_response_type:true`, and `extras.setup`.
   It does not depend on legacy v2/v3 session-message events.
2. Configure the production Markit HTTPS domain, allowed JavaScript SDK domains,
   app domains and any OAuth URLs required by the chosen Meta configuration. Use
   the App Dashboard's generated configuration/settings for the deployed origin.
3. Configure the WhatsApp webhook callback as
   `https://<markit-host>/api/connect/whatsapp/webhook`, with the configured verification
   token, and enable the **messages** field. The older `/api/whatsapp/webhook` is
   a separate shared-sender/AI integration; do not point tenant traffic there.
4. Complete business verification, app settings (icon/category/privacy policy),
   Tech Provider access verification and required permission review in Meta. Test
   during development with app-role users and eligible test business assets; normal
   customer availability is controlled by Meta's app mode and granted access.
5. Use Connect > WhatsApp > Overview to authorize each company. After authorization,
   select its granted phone number and finish. In Settings subscribe the app to that
   WABA. Register a verified number with its six-digit two-step PIN if required for
   its onboarding path; coexistence has separate Meta requirements and must not be
   assumed to need ordinary `/register`. Complete payment setup in WhatsApp Manager.
6. Create a template, wait for Meta approval, send it to an opted-in recipient and
   refresh activity for real delivery receipts. Have the recipient reply before
   testing free-form text.

References checked for the implementation: [Meta's official WhatsApp API workspace](https://www.postman.com/meta/whatsapp-business-platform/overview),
[Embedded Signup collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup),
[template management collection](https://www.postman.com/meta/whatsapp-business-platform/folder/huymv7d/templates).
Meta developer documentation pages returned HTTP 429 during this session, so the
live dashboard's selected configuration must be verified during real signup testing.

## Onboarding and tenant boundaries

All seller endpoints use the authenticated admin/manager plus `assertCompanyAccess` on
`x-company-id` (or query/session fallback). Mutations require a same-origin browser
Origin header. Responses use `Cache-Control:no-store`. Never trust a browser-supplied
WABA or phone ID as proof of access.

`start` creates a 10-minute, company/user-bound nonce in an AES-GCM encrypted,
HttpOnly, SameSite=Lax cookie. `exchange` trades the SDK authorization code on the
server, or accepts an app-admin testing token. Token inspection must report validity,
the configured app ID, both WhatsApp permissions and WABA granular grants. The
server discovers phone numbers from those granted WABAs; `finish` revalidates them
before saving. The browser receives only account/phone metadata. Pending tokens
remain in the encrypted cookie; permanent tokens are encrypted in PostgreSQL.
Credential length is bounded to keep the pending cookie within browser limits.

One company has one WABA/phone connection. WABA and phone IDs are globally unique
among Markit connections, preventing two companies from sharing templates or inbound
traffic accidentally. Reauthorization and reconnect retain the same number and
history. Replacing a company's number is deliberately rejected; number migration
and multiple numbers per company require a separate lifecycle design.

Disconnect unsubscribes this app from the company's WABA and then removes its
stored credential, marking the connection inactive. A failed unsubscribe retains
the credential so the admin can resolve/retry it. Disconnect preserves historical
messages; it does not delete the customer's Meta account, number or templates.

## Workspace and API contracts

All paths below use `/api/connect/whatsapp/` and require an authenticated company
admin or manager except the public signature/verification-protected webhook.

| Action | Method | Behavior |
|---|---|---|
| `status` | GET | Configuration/schema readiness and public connection metadata |
| `start` | POST | Start a company/user-bound signup attempt |
| `exchange` | POST | `{state,code}` or `{state,accessToken}`; validate and discover assets |
| `finish` | POST | `{state,wabaId,phoneId}`; persist selected, revalidated connection |
| `subscribe` | POST | Subscribe this app to the WABA; dashboard messages-field setup is still required |
| `register` | POST | `{pin}`; Cloud API number registration, PIN never persisted |
| `health` | GET | Live phone quality/verification/platform metadata and app subscriptions |
| `profile` | GET/POST | Read/update about, address, description, email and up to two websites |
| `templates` | GET | WABA template status/components/rejection reason; opaque `after` cursor |
| `templates` | POST | `{name,language,category,components}`; real Meta submission |
| `templates` | PUT | `{id,name,language,category,components}`; scoped template edit |
| `templates` | DELETE | `{id}`; scoped specific template/language deletion after UI confirmation |
| `messages` | GET | Latest 50 messages; `before` record cursor for older history; available after disconnect |
| `messages` | POST | `{requestId,to,type,templateId?,components?,text?,consent:true}` |
| `disconnect` | POST | Unsubscribe, erase credential, retain history |
| `webhook` | GET/POST | Meta challenge verification / exact raw-body HMAC validation and event ingestion |

Templates support the basic text/numbered-variable builder and a complete components
JSON editor for more complex formats. Meta validates headers, media handles,
authentication formats and buttons. Existing templates edit their complete components;
name/language are immutable. All template edit/delete/send IDs are verified through
the connection's WABA edge. List responses strip Meta paging URLs because those can
contain access tokens. Send verifies current `APPROVED` status and uses the template's
server-fetched name/language. Simple header/body text variables have form fields;
media, dynamic buttons and named parameters use advanced send-components JSON.

## Messaging and webhook guarantees

Recipients are full international numbers; country codes are never silently added.
Each send records an admin consent attestation/time; this is evidence of the admin's
confirmation, not an independently verified opt-in register. Businesses must maintain
their underlying consent records. Free-form text requires a signed inbound message
for that recipient/connection within 24 hours, checked against database time.

An outbound intent is inserted before contacting Meta. A client request UUID dedupes
repeated submissions; reusing it with different content is rejected. The browser
never automatically retries a send. `ACCEPTED` means Meta returned a message ID;
only webhooks confirm `SENT`, `DELIVERED`, `READ` or `FAILED`. Ambiguous network or
persistence errors become `UNKNOWN`; process interruption can leave `PENDING`. These
states must be investigated before another intentional send. Manual sends have no
automatic retry. The separate customer notification outbox also retains uncertain
sends without automatically repeating them.

External mutation actions, send, disconnect and message webhook ingestion lock the connection row. Receipts
cannot overtake the accepted-send transaction. Webhooks resolve both WABA and phone
ID to an active connection. Meta message IDs are unique and duplicate inbound
deliveries do nothing; receipt ranking prevents old sent/failed notifications from
downgrading delivered/read messages. Only text/media metadata is stored for inbound
messages; attachments are not downloaded or displayed. Template approval status is
refreshed from Meta rather than persisted by a template webhook. Activity refresh is
manual. This feature does not invoke the existing shared-number AI responder or
replace billing/coupon/OTP routes.

Message content and recipient numbers are business data. Disconnect retains them;
company deletion cascades through the connection/message foreign keys. No separate
retention timer or bulk campaign automation is included. Customer notification
permissions and STOP processing are described below. Existing manual invoice/OTP
sends continue using the older shared sender; automatic customer notifications use
the connected company's sender.

## Automatic customer notifications

The **Notifications** tab is implemented by `WhatsAppNotifications.vue`,
`utils/whatsapp-notifications.ts` and the server notification/source helpers.
It covers sales/invoices, quote sharing, order/shipping/payment state, grouped
coverage activation, installation appointments/completion, maintenance and expiry
reminders, service claims/visits/invoices, receipts/reversals, returns/replacements
and feedback. Administrators/managers can configure every event and template,
record client permissions, book installation and inspect delivery activity.

`WhatsAppNotificationSettings`, `WhatsAppNotificationContact`,
`WhatsAppNotificationSource`, `WhatsAppNotificationOutbox` and
`WhatsAppInstallationAppointment` are authoritative in `schema.zmodel`.
Migration `20261118160000_whatsapp_notifications` is prepared only and requires
separate authorization. It depends on the base Connect tables; neither runtime nor
tests install them. The settings endpoint reports readiness before controls appear.

A five-minute protected cron reads committed business state with keyset pagination,
so public storefront and carrier updates do not depend on browser sends. Source
observations baseline historical records on activation and coalesce intermediate
changes between runs. Stable hashed company event keys deduplicate queue writes.
Quote share also queues its revision-bound event in the share transaction when this
company feature is enabled. The worker commits its intent before Meta, checks current
permissions/source/rule/connection again, and shares the existing webhook connection
lock. Definite failures, obsolete entries and unknown sends remain visible.

Client permissions record an explicit international recipient and saved client-phone
fingerprint. Changes to that phone invalidate the record. Service and Marketing
permissions are separate. Signed STOP/UNSUBSCRIBE revokes both, deduplicated by inbound
Meta ID and bounded by the permission timestamp. Automatic templates use four body
values: client, company, update title and details; ownership and approval are checked
against the company's WABA. Feedback requires a Marketing template/permission.

See [setup, timing and operational contracts](WHATSAPP-NOTIFICATIONS.md).
`npm run test:whatsapp-notifications` checks types, event and delivery behavior,
seller/cron/webhook access and the actual notification controls in Chromium.

## App Review recording

Use the real connected account and actual recipient WhatsApp UI for recordings;
test fixtures and fake receipts are not submission evidence.

- Messaging permission: show login/company selection, Connect > WhatsApp > Messages,
  choose an approved template, fill recipient/variables, confirm opt-in and send.
  Show the returned message ID and the same message received in WhatsApp Web/mobile.
  Delivery receipts strengthen operational evidence but do not replace the recipient UI.
- Management permission: record a separate video opening Templates, creating a unique
  template with samples, submitting it to Meta and refreshing to show the saved ID/status.
  Show Embedded Signup/account selection if requested by Meta's review instructions.
- Complete Meta's required API tests, wait for dashboard test-call visibility, and attach
  the requested videos/instructions/test credentials in App Review. The app cannot
  submit the review or guarantee permission approval automatically.

## Validation

`npm run test:connect-whatsapp` runs isolated Vue/server type checking, encryption/
signature/validation checks, real local HTTP handlers with an in-memory SQL adapter
and mocked Meta API, and a headless Chrome workflow using the actual Nuxt UI controls.
It covers onboarding, company boundaries, template submission, approval checks,
consent, send deduplication, uncertain responses, receipt replay, reply-window
enforcement, history and disconnect. It performs no database writes, schema changes
or real Meta calls. Real Meta signup, billing, registration, deployment and delivery
still require the operator configuration and separately approved migration.
