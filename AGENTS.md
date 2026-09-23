# Markit agent workflow

These instructions apply to every task in this repository.

1. Before investigating or changing code, load and follow `.agents/skills/read-markit-docs/SKILL.md`. Read only the documentation it routes to for the area being changed.
2. Keep tenant boundaries intact: seller/admin operations belong in Markit; browser storefront endpoints belong in `markit-custom-api`. Shared ecommerce data must remain scoped by `companyId`.
3. `schema.zmodel` in this repository is the only source of truth for database schema changes, including tables and fields used by `markit-custom-api` or any storefront. Apply every schema addition or update here first; never create an independent schema definition in another repository.
4. After changing code, configuration, schema, migrations, routes, behavior, or operational workflows, load and follow `.agents/skills/update-markit-docs/SKILL.md` before declaring the task complete. A documentation update may be unnecessary, but the skill's impact check is not optional.
5. Do not edit documentation merely to record internal refactors that do not alter a maintained contract. When documentation is affected, update it in the same change.
