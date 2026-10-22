import { createError } from 'h3';
import { pool } from '~/server/db';

/** Verify deployed tables without changing schema or tenant data. */
export function createTableReadinessCheck(tables: readonly string[], feature: string) {
  const required = [...tables];
  let ready: Promise<void> | null = null;
  return () => {
    if (!ready) {
      ready = pool.query<{ name: string }>(
        'SELECT name FROM unnest($1::text[]) AS required(name) WHERE to_regclass(name) IS NULL',
        [required],
      ).then(({ rows }) => {
        if (rows.length) throw createError({
          statusCode: 503, statusMessage: `${feature} needs database setup before it can be used`,
          data: { code: 'DATABASE_SETUP_REQUIRED' },
        });
      }).catch(error => {
        ready = null;
        throw error;
      });
    }
    return ready;
  };
}
