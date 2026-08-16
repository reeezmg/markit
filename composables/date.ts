export function formatDate(dateString: string): string {
    try{
        const date = new Date(dateString);
    
        if (isNaN(date.getTime())) {
            throw new Error("Invalid date format");
        }
    
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
    
        const dayStr = day < 10 ? `0${day}` : `${day}`;
        const monthStr = month < 10 ? `0${month}` : `${month}`;
    
        return `${dayStr}/${monthStr}/${year}`;
    }
    catch(err){
        return ''
        console.error(err)
    }
    
}

/**
 * Formats an ISO timestamp for a native `<input type="date">` (`YYYY-MM-DD`)
 * using the **local** calendar day.
 *
 * Slicing the ISO string (`iso.split('T')[0]`) reads the UTC day instead, which
 * is off by one for any timestamp whose local day differs from its UTC day
 * (e.g. a bill created 01:30 IST is `…T20:00:00Z` of the previous day). Lists
 * render dates with `toLocaleString`, so the input must be local too.
 */
export function toDateInputValue(value: string | Date | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Applies a `YYYY-MM-DD` value coming from a date input onto an existing
 * timestamp, keeping its original time of day (local).
 *
 * Returns `null` when the input is incomplete or not a real date — native date
 * inputs emit `''` while the user is still typing a segment, and the old
 * `new Date(val + 'T' + iso.split('T')[1])` form threw `Invalid time value`
 * on those, silently dropping the edit.
 */
export function applyDateInputValue(
    current: string | Date | null | undefined,
    input: string | null | undefined,
): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input ?? '').trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const base = current ? new Date(current) : new Date();
    const next = isNaN(base.getTime()) ? new Date() : new Date(base.getTime());
    next.setFullYear(year, month - 1, day);

    // Rejects overflow (e.g. 2026-02-31 rolling into March).
    if (isNaN(next.getTime()) || next.getMonth() !== month - 1 || next.getDate() !== day) return null;

    return next.toISOString();
}

export function formatTime(dateString: string): string {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
    }

    const hours = date.getHours();
    const minutes = date.getMinutes();

    const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
    const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;

    return `${hoursStr}:${minutesStr}`;
}