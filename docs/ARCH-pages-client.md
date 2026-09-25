## Client / CRM Pages

### Client (`/client`)

**Files:**
- `pages/client/index.vue` — client management table
- `components/Billing/AddClient.vue` — shared add/link client modal (used in both client page and billing)

**ZenStack hooks used:**
`useFindManyClient`, `useCountClient`, `useFindUniqueClient`, `useCreateClient`, `useUpdateClient`, `useUpdateManyClient`, `useUpdatePipeline`, `useUpdateBill`

**Tables touched:** `clients`, `company_clients`, `pipelines`, `bills`, `entries`

---

#### Client List (`index.vue`)
- Lists `Client` records filtered by `companies.some.companyId` — i.e. only clients linked to current company via `CompanyClient`
- Points, active status, and flat CRM `pipelineStatus` are displayed from the current company's `CompanyClient` row (included via `companies` relation, filtered by companyId)
- Bills are included with entries — expandable rows show bill history per client
- Search by `name`, `email`, or `phone` (OR condition)
- **Toggle status:** flips `CompanyClient.status` individually via `useUpdateCompanyClient` or bulk via `useUpdateManyCompanyClient`
- **Delete bill:** soft delete via `UpdateBill` (`deleted: true`)
- **Edit bill notes:** inline popover with textarea + save button
- **Download as VCF:** exports all current page's clients as `.vcf` vCard file (name, phone, email) — useful to import into phone contacts
- **Pipeline management:** dropdown per client to move through stages (new → prospect → viewing → reject → close)

**Pipeline change logic (`changePipeline`):**
1. Disconnects client from `${fromPipeline}Clients` array on `Pipeline` when a pipeline id/current stage are available
2. Connects client to `${toPipeline}Clients` array on `Pipeline`
3. Updates current-company `CompanyClient.pipelineStatus` to the new stage

**CRM Pipeline (`changePipeline`):**
1. `UpdatePipeline` — disconnect from current pipeline stage, connect to new stage in the Pipeline M2M table
2. `UpdateCompanyClient({ pipelineStatus: newStatus })` — also sets flat company-scoped `pipelineStatus`
3. Stages: `new → prospect → viewing → reject → close`
4. Pipeline stages shown as a stepper/badge per row

**Bulk actions:**
- Activate / Deactivate selected clients for the current company: `useUpdateManyCompanyClient({ status: true/false })`
- VCF export: downloads all current-page clients as a single `.vcf` contact file (`generateVcf()` utility)

**Expandable sub-table per client:** shows client's bills with columns: Inv#, Date, Entries count, Value, Notes

**Add client modal:** `BillingAddClient` component (shared with billing flow)

**Pagination:** `useCountClient` with same filters; standard page/pageCount controls

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
