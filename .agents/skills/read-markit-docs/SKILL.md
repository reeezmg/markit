---
name: read-markit-docs
description: Route Markit seller-app work to the relevant repository documentation. Use before investigating, planning, or editing anything in the Markit repository.
---

# Read Markit documentation

Identify the task's affected areas, then read the smallest relevant set before acting:

- Start with `README.md` for setup, commands, or repository orientation.
- Read `docs/storefront-memory.md` for storefront editor/agent behavior, generated storefront state, or cross-repository storefront integration.
- Read `CRM-DEPLOY.md` for CRM deployment or operational changes.
- Read `server/shipping_service/README.md` for shipping-service or carrier work.
- For schema or persistence work, inspect both `schema.zmodel` and `prisma/schema.prisma`, plus relevant migrations. These are source contracts even where a prose document does not exist.

`schema.zmodel` is the authoritative database schema for all three repositories. Any
database addition or change required by Markit, `markit-custom-api`, or a storefront
must be made there first. API implementation remains in `markit-custom-api`; do not move
browser ecommerce routes into Markit merely because Markit owns the schema.

Search for nearer `README.md` or `AGENTS.md` files in the affected subtree and follow them too. Verify documentation against current source.

If documentation is wrong or stale, investigate the owning implementation, schema,
configuration, migrations, and tests until the actual behavior is clear, then correct
the documentation as part of the current task. Do not wait for the update skill when a
verified correction can be made safely now. Documentation drift does not authorize a
code change that the user did not request; describe current code accurately unless the
task also asks to change it.

Do not read every document by default. Track which maintained contracts the change may affect so they can be checked after implementation. Record any correction for the final summary.

## Expanding review scope

Start with the requested files, then expand with the code actually inspected or relied
upon. If investigation reaches another schema model, route, service, integration,
configuration, migration, or repository, its relevant documentation enters scope too.
Repair verified gaps anywhere in that reached scope, including pre-existing ones.

Stop when the behavior and its direct contracts are understood and the next dependency
is unrelated. Do not turn an ordinary task into a repository-wide audit. Report an
uncertain gap rather than documenting a guess.
