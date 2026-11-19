/** Keep the Connect page and seller API authorization policy aligned. */
export function canManageConnect(role: unknown): boolean {
  return role === 'admin' || role === 'manager'
}
