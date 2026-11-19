# Client WhatsApp notifications

This is a prepared local feature. Database installation and live company activation
are separate steps. No request, build or test installs its database structures.

Use `/connect/whatsapp?tab=Notifications` after selecting the owning company.
Administrators and managers can also open **WhatsApp notifications** from After-sales.
The workspace contains event/template controls, client permissions, installation
appointments and delivery activity.

## Installation and activation

1. Review the authoritative `WhatsAppNotification*` and
   `WhatsAppInstallationAppointment` contracts in `schema.zmodel` and the prepared
   `20261118160000_whatsapp_notifications/migration.sql`. The base
   `20261103120000_connect_whatsapp/migration.sql` must already be installed or be
   separately authorized alongside it. Apply only explicitly approved migrations;
   do not run the entire pending migration directory.
2. Complete normal local ZenStack/Prisma generation. If Windows holds the Prisma
   engine DLL, coordinate stopping that application before regenerating its client.
   Deploy matching application code and generated output after generation succeeds.
3. Follow [WhatsApp Connect setup](ARCH-connect-whatsapp.md) to connect and subscribe
   the company's own number. Configure private `WHATSAPP_NOTIFICATION_ORIGIN` to the
   public Markit HTTPS origin, `https://markit.co.in`, without a path or credentials. Existing receipt and
   quote sharing signing secrets must also be configured; activation validates them.
4. In Notifications, submit starter templates or select existing compatible approved
   templates. Starter names are `markit_customer_update` (Utility) and
   `markit_service_feedback` (Marketing), language `en_US`. Creation is an explicit
   UI action, never an automatic background Meta mutation. Refresh after approval.
5. Bind templates to enabled events. The template body has exactly four numbered
   variables: **client**, **company**, **update title**, **details**. Only static text
   headers/buttons are supported by this automation; the separate manual sender
   continues supporting advanced templates. Template ownership, approval and format
   are checked during activation and again before delivery. Feedback requires a
   Marketing template. Any Marketing template also requires marketing permission.
6. Record the client's full international recipient number, service/marketing
   permissions and the permission source. Permission is not inferred from a sale,
   an imported phone number or an inbound chat. A changed saved client phone requires
   a renewed record. Replying STOP or UNSUBSCRIBE revokes both permissions; replayed
   signed messages do not revoke a later permission record again.
7. Save the master switch. Activation snapshots existing records, avoiding historical
   sale/job messages. Upcoming due reminders can still be scheduled. Ensure the
   protected five-minute `/api/cron/whatsapp-notifications` schedule is deployed with
   `CRON_SECRET` and enough host execution time for the configured workload. Process
   notifications now is an explicit live send action, subject to the same checks.

Demo contacts use fake identifiers. Record a real consenting test recipient
before evaluating actual WhatsApp delivery. Never infer consent for all clients from
the user's request to implement notifications.

Invoice notifications use the existing signed `/receipt/:billId?share=...` page on
`markit.co.in`. It uses the same receipt data and thermal PDF generator as billing's
Pay now flow. Automatic messages open the receipt with its Download PDF action;
Pay now's manual send first uploads a browser-generated PDF and links directly to
that stored file. Background notifications do not manufacture a stored PDF reference.

## Events and timings

The committed-state scanner reads paginated company-owned sources, including changes
made by the public storefront and carrier integration. It compares observations every
five minutes and sends the latest meaningful state; intermediate states that change
and disappear between scans are coalesced. The scanner does not alter source business
records. Requesting a signed quote share additionally queues its notification in that
transaction, deduplicated with the scanner's quote event key.

| Source | Notifications |
|---|---|
| Quotes | Shared quote link, bound to the current revision and expiry |
| POS / invoice | Saved sale, service invoice, negative return document; signed receipt viewer supports PDF download |
| Orders | Confirmation, dispatch/out-for-delivery, delivery, cancellation, failed delivery, received return and paid status |
| Registered unit | One activation summary containing all active plans; installation completion, return and replacement |
| Agreements | Expiry notices 30 days before, 7 days before and on expiry |
| Maintenance | 7 days before, due date and 7 days overdue |
| Service job | Claim acknowledgement/decision/progress, booking/reschedule/cancellation, completed service and next due date |
| Appointments | Reminder during the 24 hours preceding the appointment; cancellation/rescheduling invalidates the old slot |
| Installation bookings | Book/reschedule/cancel in Notifications; completed installation remains the existing after-sales date action |
| Invoice terms | Balance reminder 3 days before, on due date and 7 days overdue; no invented due date for credit without terms |
| Credit receipts | Collection and reversal; current invoice balance and signed document link |
| Follow-up | Feedback the day after a newly observed completion; eligible for 7 days and requires marketing permission |

Date reminders become due at 09:00 Asia/Kolkata, matching the existing after-sales
calendar. Ordinary notifications expire after two days; appointment reminders expire
at the appointment. Failed jobs, cancelled/returned units, paid invoices and edited
quotes are rechecked before sending, suppressing obsolete updates.

## Delivery and operations

Every event has a stable company-scoped outbox key. Scanner retries do not create
duplicate events. The worker commits its message intent before contacting Meta,
then rechecks the connection, permissions, rule and current source. It uses the same
connection lock as manual sends, signed receipts and STOP processing. Disconnect
retains history and stops sending.

`ACCEPTED` means Meta returned an ID; `SENT`, `DELIVERED`, `READ` and delivery failures
come from the existing signed webhook. Timeouts or failures after a possibly accepted
POST remain `UNKNOWN`. Interrupted `SENDING` entries become `UNKNOWN` after ten minutes.
Neither is automatically retried. Definite failures and skipped entries retain a
reason in Delivery activity. Investigate the existing message before deciding to
send another one manually. The worker drains at most ten due entries per company per
run; larger queues continue on later runs.

Pausing cancels queued entries. Reactivation snapshots current business records and
restores only paused entries whose scheduled send time is still in the future. It
does not send missed historical sales, appointments or feedback.

All new tables deny generated-model access. Dedicated administrator/manager endpoints
under `/api/whatsapp-notifications/:action` enforce company access, same-origin writes
and no-store responses. The protected cron operates only on enabled active companies.
The original shared-number billing, coupon and OTP actions remain separate from this
company-owned automation; clicking a manual Send is an additional intentional send.

## Verification

`npm run test:whatsapp-notifications` runs focused Vue/server type checks, event,
scanner and worker regressions, actual seller/cron/webhook handler checks and a
Chromium journey through notification settings, client permissions, installation
booking/cancellation and delivery activity. Meta calls and writes use isolated test
adapters; no real messages or DDL are performed. `PRINT_TEST_WINDOW_SIZE=390,844`
selects a mobile viewport for the browser runner.

`scripts/check-whatsapp-notifications.ts` performs only readiness reads and a
`BEGIN READ ONLY` source scan of the selected demo company. It prints readiness
flags and source counts without credentials or client content. This does not verify
live delivery or the new-table SQL against an installed notification schema.

Template component reference: [Meta's template sending documentation](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive).
