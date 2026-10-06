// Disposable schemas must not leave session search_path settings on application pooler connections.
export function accountingTestDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.hostname.endsWith('.neon.tech')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
    url.searchParams.delete('pgbouncer');
  }
  return url.toString();
}
