/**
 * Turn a carrier rejection into something a seller can read.
 *
 * Delhivery answers with whatever shape suits it: a plain sentence, several
 * sentences joined by semicolons, or a JSON object keyed by payment mode —
 * `{"prepaid": "Client wallet balance is 414.91 which is less than 500.0"}`.
 * That JSON was reaching the toast verbatim, so the one line that mattered
 * ("top up your wallet") was buried in braces and quotes.
 *
 * Everything here is the carrier's own wording — only the packaging is removed,
 * never the message, because their text is what the seller quotes back to
 * carrier support.
 */

/** Keys that only wrap the real message and add nothing when shown. */
const WRAPPER_KEYS = ['message', 'error', 'errors', 'detail', 'details', 'remarks', 'rmk', 'reason', 'status'];

/** Shipping shorthand the seller reads as an acronym, not a word. */
const ACRONYMS: Record<string, string> = {
  cod: 'COD', awb: 'AWB', otp: 'OTP', ndr: 'NDR', gst: 'GST', pin: 'PIN', pod: 'POD', ewbn: 'E-way bill',
};

const titleCase = (key: string) =>
  ACRONYMS[key.toLowerCase()]
  || key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

/** Parse a string that is really a JSON payload; otherwise keep it as text. */
function maybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/** One carrier payload (string, array or object) as readable lines. */
export function carrierMessage(raw: unknown): string {
  if (raw == null) return '';

  if (typeof raw === 'string') {
    const parsed = maybeJson(raw);
    if (typeof parsed !== 'string') return carrierMessage(parsed);
    // The carrier joins several validation failures with ";" — one bullet each
    // reads far better than a run-on line.
    const parts = parsed.split(';').map((p) => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts.map((p) => `• ${p}`).join('\n') : (parts[0] || '');
  }

  if (Array.isArray(raw)) {
    return raw.map(carrierMessage).filter(Boolean).join('\n');
  }

  if (typeof raw === 'object') {
    const entries = Object.entries(raw as Record<string, unknown>)
      .map(([key, value]) => [key, carrierMessage(value)] as const)
      .filter(([, text]) => text);
    if (!entries.length) return '';
    return entries
      .map(([key, text]) =>
        // A key like "prepaid" or "cod" is real context (which payment mode was
        // rejected); a key like "message" is just packaging.
        WRAPPER_KEYS.includes(key.toLowerCase()) || /^\d+$/.test(key)
          ? text
          : `${titleCase(key)}: ${text}`)
      .join('\n');
  }

  return String(raw);
}

/**
 * The readable message for a failed `$fetch`, wherever the carrier's words
 * ended up on the error object.
 */
export function carrierError(e: any, fallback = 'Request failed'): string {
  const raw = e?.data?.statusMessage ?? e?.data?.message ?? e?.data?.detail ?? e?.message;
  return carrierMessage(raw) || fallback;
}
