import assert from 'node:assert/strict';

export function readOnlyAuditJob(value: string | undefined, forms: boolean, bundled: boolean) {
  if (!value) return '';
  assert.ok(value === 'head' || value === 'branch', 'Read-only audit job must be head or branch');
  assert.ok(!forms && bundled, 'Separate company jobs require the bundled read-only audit');
  return value;
}
