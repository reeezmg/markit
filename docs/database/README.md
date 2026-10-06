# Storetools Database Documentation

`storetools/schema.zmodel` is the authoritative declarative schema for the PostgreSQL database shared by Storetools and customer-facing services.

| File | Purpose |
|---|---|
| [`dbMeta.json`](./dbMeta.json) | Every model, enum, effective field, mapping, default, attribute and relation |
| [`dbExplanations.json`](./dbExplanations.json) | Editable model purpose and field explanations; new entries start blank |
| [`DB-CATALOG.md`](./DB-CATALOG.md) | Generated human-readable model/field catalog |
| [`../ARCH-schema.md`](../ARCH-schema.md) | Business meaning, workflow ownership and cross-model explanations |
| [`WORKFLOWS.md`](./WORKFLOWS.md) | Plain-language map of the main records and their lifecycle |

The generator parses all model and enum blocks, materializes inherited fields, and retains model/field attributes. It merges the editable explanations into both catalogs without overwriting existing wording. Newly discovered models and fields receive empty explanation strings in `dbExplanations.json`; fill those after checking their callers. The catalog's code-reference paths are search matches, not proof that a particular runtime branch executes.

```bash
node storetools/scripts/generate-db-meta.mjs
node storetools/scripts/check-db-meta.mjs
```

Database change workflow: change `schema.zmodel`, generate the normal migration, regenerate this catalog, fill new entries in `dbExplanations.json`, update `ARCH-schema.md` and the owning topic, then run affected tests.

For the new ecommerce Accountant connection, preview with
`node scripts/apply-ecommerce-accounting.mjs` from Storetools, then use `--apply`
to install only its status-history and ecommerce-accounting migrations. Existing
Accountant/ERP/party-link migrations are prerequisites. Choose the company and
activate under Accountant > Ecommerce accounting; this excludes existing orders.
No historical imports, live activation or gateway money movements occur on install.

Paid-date/status-history migration: from `storetools`, run
`node scripts/apply-document-status-history.mjs` to preview, then add `--apply`
to install only `20261001120000_document_status_history` against the configured database.
The runner uses a transaction and migration checksum; it does not run unrelated pending
migrations or backfill dates. Deploy this migration before the new history reader or
regenerated Prisma client. Run normal ZenStack generation after schema changes (stop
the local server first if Windows locks the Prisma engine DLL). `prisma db push`
alone cannot install the tracking triggers. Test with `npm run test:document-status`;
the database test uses an isolated schema and rolls everything back.

`ecommerce-api/api/app/tables.py` contains compatibility/startup DDL. Compare it
against `schema.zmodel` before changing either source. `ecomm_payment_intents`
is mirrored by `EcommPaymentIntent` in the zmodel. Any remaining API-created tables
without models are recorded under `unmodeledRuntimeTables` in `dbMeta.json`.
Newly discovered API-created tables and columns start with blank explanations too.
