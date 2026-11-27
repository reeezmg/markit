# Sidebar section and page settings

`pages/settings/sidebar.vue` adds **Settings → Sidebar**, retaining the existing
authorized `entryCompany` settings scope. Administrators and managers select ERP,
CRM, Storetools (the existing storefront tools) and Connect, plus individual pages
within each section. `components/settings/SidebarPreferences.vue` provides search,
section toggles, grouped page checkboxes, select/clear, Show all, Hide all and save.
Other members can inspect settings but cannot save them.

`utils/sidebar-menu.ts` owns the menus previously declared in `layouts/default.vue`.
Both Settings and the actual sidebar use this single source. Existing plan, role,
invoicing, after-sales and staff-tracking gates run before presentation filtering.
The active company's sidebar intersects its permitted menu with the saved settings;
editing a branch changes only that branch's preferences and never the login cookie.
After-sales appears only in ERP, immediately below Expense when the after-sales
workflow is enabled. The Storetools/ecommerce section omits this group.

`utils/sidebar-navigation.ts` owns versioned normalization, stable path/query page
keys and recursive filtering. A disabled section or empty filtered group disappears.
Parent destinations follow the first selected child when their original destination
is unavailable. Each section has independent choices, including shared Settings
routes. CRM's client link retains `?from=crm` as part of its page key;
`entryCompany` is context and is excluded from page keys. Existing page selections
remain saved while a section/workflow is disabled. Newly available pages default to
visible unless their saved page key was explicitly hidden.

Expanded and collapsed layout sections use the same filtered menu. With zero or one
available section, the entire switcher header is omitted in both modes; a sole
section's pages remain visible automatically. With multiple sections, the expanded
sidebar shows section icons in one horizontal row with no filled button backgrounds.
Each icon has a tooltip and accessible section name, a 40px click target, and an
orange underline for the active section. Left/Right and Home/End select sections;
only the active icon is a Tab stop, with a visible keyboard focus ring.
Collapsed sections use the same icons in a centered vertical column with an active
left marker, Up/Down and Home/End selection. Only enabled, nonempty sections appear.
Empty switchers are hidden.
The custom
`Accountant/SidebarNavigation.vue` accepts `allowedPaths`, filters its internal
sections and drops empty ones; neither layout can restore hidden Account pages.
Route-based section selection falls back to the first nonempty enabled section.
`layouts/default.vue` keeps the selected section in company-keyed Nuxt state so
layout remounts retain the choice. CRM routes (including `/client?from=crm`),
Connect, after-sales and Storetools-specific routes select their owning section.
Shared Settings destinations preserve the originating section;
refreshing preferences on the same route does not reset an enabled selection.
Disabling the selected section still falls back to an available section.
When all sections/pages are hidden, the user-menu Settings link remains available
in both sidebar modes. Hiding navigation changes presentation only; existing route
and API authorization remains responsible for access. Keyboard shortcuts and direct
links retain their existing behavior.

`useSidebarPreferences` shares company-keyed reactive values between layout and
Settings. Saving updates the edited company immediately. Read generations and local
save revisions prevent an older GET or another company's response replacing a saved
value. Requests use the authorized company header; SSR uses the request fetcher.
Settings displays loading/save failures and offers reload. Companies without saved
preferences have only ERP enabled; CRM, Storetools and Connect default to false.
Explicit saved section flags override these defaults, so company exceptions persist
without hard-coded merchant names or IDs in application behavior.

`GET /api/settings/sidebar-navigation` reads preferences without initializing data.
`PUT` requires a live originating membership, admin/manager role, authorized selected
company and same-origin request. A company row lock serializes saves. Optimistic JSON
revision checks return 409 for stale edits; previous JSON is backed up before the
replacement is written, all in one transaction. Generic generated preference APIs
reject creation, update or deletion of the reserved `sidebar-navigation` namespace,
including its backup.

Persistence uses existing `general_preferences` rows with
`page_name='sidebar-navigation'`, `preference_key='defaults'` and `defaults-backup`.
JSON is `{version:1,revision,sections:{erp,crm,storefront,connect}}`; section values
are `{enabled,hiddenPages}`. The physical `storefront` key remains stable while its
visible section label is Storetools. The authoritative GeneralPreference contract
is recorded in `schema.zmodel`. No database schema change or migration is required.

Focused verification lives in `tests/sidebar-navigation.test.ts` and
`tests/sidebar-navigation-browser.html`. The browser fixture mounts the real layout,
settings editor, shared composable and custom Account navigation with presentation
stubs and mocked HTTP. It checks all 15 nonempty section combinations at sidebar
widths 200, 250 and 300px in both modes, including single-row icon placement, accessible names, section selection,
collapsed icon bounds, centering and keyboard selection. It does not send customer messages or modify live
data. The browser runner's `--preview` option displays the four section counts for
visual inspection; `PRINT_TEST_SCREENSHOT` optionally captures that fixture.

Run `npm run test:sidebar-navigation` and `npm run test:sidebar-navigation:mobile`.
The 19 November 2026 verification passed all six focused scenarios, desktop/mobile
browser journeys, 139 Vue compilation checks and a comparison preserving 288
existing plan/role/workflow menu combinations. Catalog generation/checks passed.
The initial settings implementation performed no live database writes. Authorized
company-default data updates are recorded separately in the sidebar verification
artifact. No database schema changes are needed or performed.
