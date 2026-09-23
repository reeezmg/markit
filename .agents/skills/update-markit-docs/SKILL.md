---
name: update-markit-docs
description: Check and update Markit documentation after code, schema, configuration, route, integration, or operational changes. Use before completing any non-documentation-only change in Markit.
---

# Update Markit documentation

Review the completed diff and update documentation that describes changed public behavior, setup, architecture, data contracts, integrations, deployment, or operations.

While doing this review, also repair pre-existing documentation errors discovered in
the affected area. Verify each correction against the owning code, schema,
configuration, migrations, and tests. Prefer a complete, coherent correction over a
small wording patch that leaves nearby statements contradictory. Do not change working
code merely to make it match stale documentation unless the user's task requires that
code change.

- Keep `schema.zmodel`, `prisma/schema.prisma`, and migrations consistent; document non-obvious data invariants near the owning architecture or service document.
- Reject schema changes that exist only in `markit-custom-api` or a storefront. The authoritative definition must be present in `schema.zmodel` before dependent API/client work is considered complete.
- Storefront-agent behavior changes must be reflected in the maintained live behavior specification, not only in deprecated constants or comments.
- If Markit changes a contract consumed by `markit-custom-api` or `hijabcart`, update the appropriate API/client docs in those repositories in the same workspace when they are in scope and available.
- Never put secrets, environment values, customer data, or temporary debugging notes in documentation.

No prose edit is required for an implementation-only refactor with unchanged contracts. In that case, explicitly report that the documentation impact was checked and none was needed.

The final check covers the full reached scope, not only files in the final diff. Review
every schema model, route, service, integration, configuration, migration, and sibling
contract inspected or relied upon. Fill verified omissions and contradictions there,
stop at unrelated dependencies, and report unverified gaps without guessing.
