-- Drops leftover cms_* tables that are no longer part of the Prisma schema.
-- ⚠️ Destructive: this permanently deletes all rows in these tables.
-- Take a backup first, e.g.:
--   pg_dump "$DATABASE_URL" -t 'cms_*' -F c -f cms_tables_backup.dump
--
-- CASCADE drops any foreign-key constraints from other tables that
-- reference these (e.g. cms_sections -> cms_projects), and any views
-- depending on them. Review `\d cms_*` in psql beforehand if you want
-- to confirm nothing else depends on them.

BEGIN;

DROP TABLE IF EXISTS cms_sections CASCADE;
DROP TABLE IF EXISTS cms_blogs CASCADE;
DROP TABLE IF EXISTS cms_projects CASCADE;
DROP TABLE IF EXISTS cms_amenities CASCADE;
DROP TABLE IF EXISTS cms_admins CASCADE;

COMMIT;
