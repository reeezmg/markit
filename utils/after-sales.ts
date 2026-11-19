export const serviceKinds = ['MAINTENANCE', 'WARRANTY', 'GUARANTEE'] as const
export type ServiceKind = typeof serviceKinds[number]
export type ServiceField = { key: string; label: string; type: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN'; unit: string; required: boolean }
export type ServiceRules = {
  provider: string; activation: 'DEFAULT' | 'SALE' | 'DELIVERY' | 'INSTALLATION' | 'DATE'; startDate: string;
  offset: number; offsetUnit: string; duration: number; durationUnit: string;
  coverage: string; exclusions: string; instructions: string; schedule: 'ONCE' | 'CUSTOM' | 'RECURRING';
  dates: string[]; frequency: string; interval: number; timing: 'CALENDAR' | 'COMPLETION';
  endDate: string; visitLimit: number | null; freeVisits: number; charge: number; tax: number;
  reminderDays: number[]; checklist: string[]; fields: ServiceField[]
}
export const serviceToday = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
export function serviceDay(value: unknown): string {
  const s = typeof value === 'string' ? value : ''
  const d = new Date(s + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(+d) || d.toISOString().slice(0, 10) !== s || s < '2000-01-01' || s > '2199-12-31') throw Error('Enter a valid date (YYYY-MM-DD).')
  return s
}
export function serviceText(value: unknown, label: string, max = 5000, required = false) {
  if (value != null && typeof value !== 'string') throw Error(`${label} must be text.`)
  const s = String(value ?? '').trim()
  if ((required && !s) || s.length > max) throw Error(`Enter ${label.toLowerCase()} (maximum ${max} characters).`)
  return s
}
export function serviceInteger(value: unknown, label: string, min = 0, max = 10000) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw Error(`${label} must be a whole number between ${min} and ${max}.`)
  return Number(value)
}
export function serviceMoney(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99999999 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw Error('Charge must be non-negative with at most two decimal places.')
  return value
}
export function addServiceDate(anchor: string, amount: number, unit: string): string {
  serviceDay(anchor)
  const date = new Date(anchor + 'T00:00:00Z')
  if (unit === 'DAY' || unit === 'WEEK') date.setUTCDate(date.getUTCDate() + amount * (unit === 'WEEK' ? 7 : 1))
  else {
    if (!['MONTH', 'YEAR'].includes(unit)) throw Error('Select a date unit.')
    const day = date.getUTCDate()
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount * (unit === 'YEAR' ? 12 : 1))
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()))
  }
  return date.toISOString().slice(0, 10)
}
export function defaultServiceRules(): ServiceRules {
  return { provider: '', activation: 'DEFAULT', startDate: '', offset: 0, offsetUnit: 'DAY', duration: 12, durationUnit: 'MONTH',
    coverage: '', exclusions: '', instructions: '', schedule: 'RECURRING', dates: [], frequency: 'MONTH', interval: 3,
    timing: 'CALENDAR', endDate: '', visitLimit: null, freeVisits: 0, charge: 0, tax: 0, reminderDays: [7, 0], checklist: [], fields: [] }
}
export function normalizeServiceConfiguration(body: any) {
  if (!body || !serviceKinds.includes(body.kind)) throw Error('Select maintenance, warranty or guarantee.')
  const name = serviceText(body.name, 'Configuration name', 200, true)
  const r = { ...defaultServiceRules(), ...body.rules } as ServiceRules
  r.provider = serviceText(r.provider, 'Provider', 200)
  for (const key of ['coverage', 'exclusions', 'instructions'] as const) r[key] = serviceText(r[key], key, 10000)
  if (!['DEFAULT', 'SALE', 'DELIVERY', 'INSTALLATION', 'DATE'].includes(r.activation)) throw Error('Select a start rule.')
  if (r.activation === 'DATE') r.startDate = serviceDay(r.startDate)
  else r.startDate = ''
  r.offset = serviceInteger(r.offset, 'Start offset', 0, 10000)
  for (const unit of [r.offsetUnit, r.durationUnit, r.frequency]) if (!['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(unit)) throw Error('Select a date unit.')
  r.duration = serviceInteger(r.duration, 'Coverage duration', body.kind === 'MAINTENANCE' ? 0 : 1, 10000)
  if (!['ONCE', 'CUSTOM', 'RECURRING'].includes(r.schedule) || !['CALENDAR', 'COMPLETION'].includes(r.timing)) throw Error('Select a maintenance schedule.')
  r.interval = serviceInteger(r.interval, 'Repeat interval', 1, 10000)
  if (!Array.isArray(r.dates) || r.dates.length > 500) throw Error('Enter up to 500 custom dates.')
  r.dates = [...new Set(r.dates.map(serviceDay))].sort()
  if (body.kind === 'MAINTENANCE' && r.schedule === 'CUSTOM' && !r.dates.length) throw Error('Add at least one visit date.')
  r.endDate = r.endDate ? serviceDay(r.endDate) : ''
  if (r.startDate && r.endDate && r.endDate < r.startDate) throw Error('End date precedes the start date.')
  r.visitLimit = r.visitLimit == null ? null : serviceInteger(r.visitLimit, 'Visit limit', 1)
  r.freeVisits = serviceInteger(r.freeVisits, 'Included free visits')
  r.charge = serviceMoney(r.charge)
  if (typeof r.tax !== 'number' || !Number.isFinite(r.tax) || r.tax < 0 || r.tax > 100) throw Error('Tax must be between 0 and 100.')
  if (!Array.isArray(r.reminderDays) || r.reminderDays.length > 10) throw Error('Enter up to 10 reminder offsets.')
  r.reminderDays = [...new Set(r.reminderDays.map(n => serviceInteger(n, 'Reminder days', 0, 365)))].sort((a, b) => b - a)
  if (!Array.isArray(r.checklist) || r.checklist.length > 100) throw Error('Enter up to 100 checklist items.')
  r.checklist = r.checklist.map(s => serviceText(s, 'Checklist item', 500, true))
  if (!Array.isArray(r.fields) || r.fields.length > 100) throw Error('Enter up to 100 custom fields.')
  const keys = new Set<string>()
  r.fields = r.fields.map(f => {
    const key = serviceText(f.key, 'Field key', 64, true)
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || keys.has(key) || ['constructor', 'prototype', '__proto__'].includes(key)) throw Error('Custom field keys must be unique letters, digits or underscores.')
    keys.add(key)
    if (!['TEXT', 'NUMBER', 'DATE', 'BOOLEAN'].includes(f.type)) throw Error('Select a custom field type.')
    return { key, label: serviceText(f.label, 'Field label', 100, true), type: f.type, unit: serviceText(f.unit, 'Unit', 50), required: !!f.required }
  })
  return { kind: body.kind as ServiceKind, name, rules: r }
}
export function serviceActivation(r: ServiceRules, product: any): string | null {
  const activation = r.activation === 'DEFAULT' ? (product.order_id ? 'DELIVERY' : 'SALE') : r.activation
  const anchor = activation === 'DATE' ? r.startDate : activation === 'INSTALLATION' ? product.installed_on : activation === 'DELIVERY' ? product.delivered_on : product.purchased_on
  return anchor ? addServiceDate(String(anchor).slice(0, 10), r.offset, r.offsetUnit) : null
}
/** Uses the original anchor for calendar schedules, retaining Jan 31 -> Feb 28 -> Mar 31. */
export function nextServiceDue(r: ServiceRules, startsOn: string, after?: string | null, completedOn?: string | null): string | null {
  let due: string | null = null
  if (r.schedule === 'CUSTOM') due = r.dates.find(d => d >= startsOn && (!after || d > after)) || null
  else if (r.schedule === 'ONCE') due = !after || startsOn > after ? startsOn : null
  else if (r.timing === 'COMPLETION' && completedOn) due = addServiceDate(completedOn, r.interval, r.frequency)
  else {
    const anchor=new Date(startsOn+'T00:00:00Z'),limit=after?new Date(after+'T00:00:00Z'):anchor
    const elapsed=Math.max(0,+limit-+anchor)
    let n=Math.max(1,r.frequency==='DAY'||r.frequency==='WEEK'?Math.floor(elapsed/86400000/r.interval/(r.frequency==='WEEK'?7:1)):
      Math.floor(((limit.getUTCFullYear()-anchor.getUTCFullYear())*12+limit.getUTCMonth()-anchor.getUTCMonth())/r.interval/(r.frequency==='YEAR'?12:1)))
    for (let attempts=0;attempts<3;attempts++,n++) {
      const d = addServiceDate(startsOn, n * r.interval, r.frequency)
      if (!after || d > after) { due = d; break }
    }
  }
  return due && (!r.endDate || due <= r.endDate) ? due : null
}
export function validateServiceValues(fields: ServiceField[], input: any, requireAll = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Enter custom field values.')
  const result: Record<string, any> = {}
  for (const f of fields) {
    const v = input[f.key]
    if (v === undefined || v === null || v === '') { if (requireAll && f.required) throw Error(`${f.label} is required.`); continue }
    if (f.type === 'NUMBER' && (typeof v !== 'number' || !Number.isFinite(v))) throw Error(`${f.label} must be a number.`)
    if (f.type === 'BOOLEAN' && typeof v !== 'boolean') throw Error(`${f.label} must be yes or no.`)
    result[f.key] = f.type === 'DATE' ? serviceDay(v) : f.type === 'TEXT' ? serviceText(v, f.label) : v
  }
  return result
}
