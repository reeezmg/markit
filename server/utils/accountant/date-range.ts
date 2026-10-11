import { badRequest } from './router';

/** Date-only journal filters include the entire end day. */
export function journalDateRange(from?: string, to?: string) {
  const parse = (value: string, end: boolean) => {
    const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw badRequest('Choose a valid date');
    }
    return date;
  };
  const gte = from ? parse(from, false) : undefined;
  const lte = to ? parse(to, true) : undefined;
  if (gte && lte && gte > lte) throw badRequest('From date cannot be after to date');
  return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined;
}
