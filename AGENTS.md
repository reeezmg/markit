# Markit agent workflow

These instructions apply to every task in this repository.

## Database changes (user instruction, 2026-10-06)

Never run scripts directly against Neon (or another database) to create/alter tables, columns, indexes, constraints, triggers or posting functions, run Prisma `db push`, or apply schema migrations. Start schema and posting-function changes in `C:/markit-v1/storetools/schema.zmodel`: change fields there, or document the owning model's behavior contract first when no fields change. Then prepare local migration/function definitions; local preparation is allowed and does not authorize application. Database application requires a separate explicit instruction after the authoritative source is updated. Database-writing tests must not create or alter database schemas. Direct data updates are allowed when the user authorizes the current task (clarified 2026-10-06); restrict them to requested records, back up existing data and verify results. Never manually edit generated `prisma/schema.prisma`. Read-only database inspection is allowed. Earlier production schema-migration permission is superseded.

1. Before investigating or changing code, load and follow `.agents/skills/read-markit-docs/SKILL.md`. Read only the documentation it routes to for the area being changed.
2. Keep tenant boundaries intact: seller/admin operations belong in Markit; browser storefront endpoints belong in `markit-custom-api`. Shared ecommerce data must remain scoped by `companyId`.
3. `schema.zmodel` in this repository is the only source of truth for database schema changes, including tables and fields used by `markit-custom-api` or any storefront. Apply every schema addition or update here first; never create an independent schema definition in another repository.
4. After changing code, configuration, schema, migrations, routes, behavior, or operational workflows, load and follow `.agents/skills/update-markit-docs/SKILL.md` before declaring the task complete. A documentation update may be unnecessary, but the skill's impact check is not optional.
5. Do not edit documentation merely to record internal refactors that do not alter a maintained contract. When documentation is affected, update it in the same change.
