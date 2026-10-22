/** Keep store switching on a usable page, without carrying another store's record IDs. */
export function companySwitchLocation(fullPath: string) {
  const url = new URL(fullPath, 'https://storetools.invalid');
  const destinations: [RegExp, string][] = [
    [/^\/products\/edit\/[^/]+\/?$/, '/products'],
    [/^\/products\/(brands|categories|collections)\/edit\/[^/]+\/?$/, '/products/$1'],
    [/^\/erp\/edit\/[^/]+\/?$/, '/erp/sales'],
    [/^\/erp\/online\/[^/]+\/?$/, '/erp/online'],
    [/^\/saleshistory\/[^/]+\/?$/, '/saleshistory'],
    [/^\/users\/salary\/cycle\/[^/]+\/?$/, '/users/salary'],
    [/^\/distributor\/edit-purchase-return\/[^/]+\/?$/, '/distributor/purchase-return'],
    [/^\/investments\/investors\/[^/]+\/?$/, '/investments/investors'],
    [/^\/accountant\/manual-journals\/[^/]+\/edit\/?$/, '/accountant/manual-journals'],
    [/^\/(receipt|statement)\/[^/]+\/?$/, '/dashboard'],
    [/^\/order\/(pack|ready)\/?$/, '/order/ecomorders'],
  ];
  for (const [pattern, destination] of destinations) {
    if (pattern.test(url.pathname)) return url.pathname.replace(pattern, destination);
  }
  for (const key of [...url.searchParams.keys()]) {
    if (!['from', 'to', 'startDate', 'endDate'].includes(key)) url.searchParams.delete(key);
  }
  return url.pathname + url.search;
}
