## Client / CRM Pages

### Client (`/client`)

**Files:**
- `pages/client/index.vue` — client management table
- `components/Billing/AddClient.vue` — shared add/link client modal (used in both client page and billing)

**ZenStack hooks used:**
`useFindManyCompanyClient`, `useCountCompanyClient`, `useFindUniqueClient`, `useCreateClient`, `useUpdateClient`, `useUpdateManyClient`, `useUpdatePipeline`, `useUpdateBill`

**Tables touched:** `clients`, `company_clients`, `pipelines`, `bills`, `entries`

---

#### Client List (`index.vue`)
- Lists `Client` records filtered by `companies.some.companyId` — i.e. only clients linked to current company via `CompanyClient`
- Points, active status, and flat CRM `pipelineStatus` are displayed from the current company's `CompanyClient` row (included via `companies` relation, filtered by companyId)
- Bills are included with entries — expandable rows show bill history per client
- Search by `name`, `email`, or `phone` (OR condition)
- **Toggle status:** flips `CompanyClient.status` individually via `useUpdateCompanyClient` or bulk via `useUpdateManyCompanyClient`
- **Delete bill:** confirmed, owner-scoped POST to `/api/billSale/deleteBill`.
  The full lifecycle restores sold stock, reverses connected native journals,
  adjusts loyalty/coupon contributions and removes staff-credit source entries.
  It preserves the archived old ledger. Errors remain visible and the list refreshes
  only after success. This is separate from removing the client profile.
- **Edit bill notes:** inline popover with textarea + save button
- **Download as VCF:** exports all current page's clients as `.vcf` vCard file (name, phone, email) — useful to import into phone contacts
- **Pipeline management:** dropdown per client to move through stages (new → prospect → viewing → reject → close)

**Company forms and row actions:**
- `BillingAddClient` receives `allowCompanySelection` on this page, using an independent form scope and defaulting new records to the head office. Billing callers continue to inherit their billing form's company.
- `ClientMembershipForm.vue` edits shared contact details through `/api/clients/membership` after checking the selected company membership. The form explains that contact details are shared.
- Company changes use the confirmed transfer preview. The shared Client identity stays in place; the source membership's dependent records and points move, destination membership links are reused, and destination document numbers are allocated transactionally.
- Client Delete soft-removes only the selected membership by setting
  `CompanyClient.status=false`; no Client or CompanyClient row is deleted.
  Shared identity, points, company links, bills and accounting attribution remain
  intact; no bill reversal or stock adjustment occurs. It uses the existing inactive
  state, so the client remains visible under inactive/all filters and can be activated
  again. Other companies' memberships are unchanged. Bulk status actions target
  explicit company/client pairs. Bill actions retain each bill's stored company.
  None of these actions switch the auth session.

**Pipeline change logic (`changePipeline`):**
- `/api/clients/pipeline` updates the selected company's CompanyClient stage and Pipeline's actual String[] stage fields together in a serializable transaction.
- Stages: `new`, `prospect`, `viewing`, `reject`, `close`. These fields are scalar arrays, not M2M relations.

**Bulk actions:**
- Activate / Deactivate selected clients for the current company: `useUpdateManyCompanyClient({ status: true/false })`
- VCF export: downloads all current-page clients as a single `.vcf` contact file (`generateVcf()` utility)

**Expandable sub-table per client:** shows client's bills with columns: Inv#, Date, Entries count, Value, Notes

**Add client modal:** `BillingAddClient` component (shared with billing flow)

**Pagination:** `useCountCompanyClient` with same filters; standard page/pageCount controls

**Columns:** Name, Phone, Email, Pipeline Status (badge + dropdown to change), Active status, Actions (Edit, Delete)

---

#### `Billing/AddClient.vue` — Shared Add Client Modal
Used in both the client page and the billing page to add or link a client.

- Looks up client in real-time by phone using `useFindUniqueClient({ where: { phone: '+91{phone}' } })`
- Phone numbers stored with `+91` prefix hardcoded — India-specific
- **New client:** creates `Client` + `CompanyClient` in one Prisma nested write
- **Existing client (from another store):** only creates a new `CompanyClient` link to current company — no duplicate `Client` created
- Keyboard-driven enter flow: phone → name → email → continue button
- `invalidateQueries: false` on create/update (manual cache control, caller refreshes as needed)
- Emits `clientAdded(id, name, phone)` to parent after success

---
