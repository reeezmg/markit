import { deflateRawSync, inflateRawSync } from 'node:zlib';

export function packSelectedAccounts(value: unknown): string {
  return deflateRawSync(Buffer.from(JSON.stringify(value))).toString('base64url');
}

export function unpackSelectedAccounts(value?: string): any {
  if (!value) return undefined;
  try {
    const result = JSON.parse(inflateRawSync(Buffer.from(value, 'base64url'), { maxOutputLength: 65536 }).toString());
    return typeof result?.companyId === 'string' && result?.defaults && typeof result.defaults === 'object' ? result : undefined;
  } catch { return undefined; }
}
