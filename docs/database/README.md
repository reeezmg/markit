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

`ecommerce-api/api/app/tables.py` contains compatibility/startup DDL. Compare it
against `schema.zmodel` before changing either source. `ecomm_payment_intents`
is mirrored by `EcommPaymentIntent` in the zmodel. Any remaining API-created tables
without models are recorded under `unmodeledRuntimeTables` in `dbMeta.json`.
Newly discovered API-created tables and columns start with blank explanations too.
