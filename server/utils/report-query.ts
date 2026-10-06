export type ReportDatabase = {
  query: (sql: string, values?: any[]) => Promise<{ rows: any[] }>;
};

/**
 * Run independent, authored SELECT sections in one database round trip.
 * Sections share the same bound parameters and PostgreSQL statement snapshot.
 * SQL must come from code, never from request input. JSON rows deliberately use
 * JSON types (dates are strings); callers normalize their public response types.
 */
export async function reportSections(
  db: ReportDatabase,
  sections: string[],
  values: any[]
): Promise<Array<{ rows: any[] }>> {
  if (!sections.length) return [];
  const columns = sections.map(
    (sql, index) =>
      `(SELECT COALESCE(json_agg(section), '[]'::json) FROM (${sql}) section) AS section_${index}`
  );
  const { rows } = await db.query(`SELECT ${columns.join(',\n')}`, values);
  return sections.map((_, index) => ({ rows: rows[0][`section_${index}`] }));
}
