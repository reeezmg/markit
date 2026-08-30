/**
 * Delhivery's NDR rules, in one place.
 *
 * The carrier accepts an action only for specific NSL codes, and only while the
 * shipment has 1 or 2 failed attempts — a request outside that is rejected. The
 * same rules apply to a forward delivery, a reverse pickup and an exchange leg,
 * so the orders screen, the NDR screen, and the returns/exchange screens all
 * read them from here rather than each keeping its own copy.
 */

/** Failed delivery attempt — the parcel can be sent out again. */
export const REATTEMPT_NSL = ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];

/** Cancelled (non-OTP) shipment — the pickup can be rescheduled. */
export const RESCHEDULE_NSL = ['EOD-777', 'EOD-21'];

export type NdrAction = 'RE-ATTEMPT' | 'PICKUP_RESCHEDULE';

export interface NdrState {
  nslCode?: string | null;
  ndrAttempts?: number;
  status?: string | null;
  rawStatus?: string | null;
  statusType?: string | null;
  instructions?: string | null;
}

/** Which action, if any, the carrier maps this NSL code to. */
export function ndrActionFor(nsl?: string | null): NdrAction | null {
  const code = (nsl || '').toUpperCase();
  if (REATTEMPT_NSL.includes(code)) return 'RE-ATTEMPT';
  if (RESCHEDULE_NSL.includes(code)) return 'PICKUP_RESCHEDULE';
  return null;
}

/**
 * Is this shipment in a delivery exception at all?
 *
 * Delhivery has not published its full NSL list, so an unrecognised EOD-* still
 * counts: a stuck parcel that looks perfectly normal is the worse failure.
 */
export const isNdrException = (live?: NdrState | null) =>
  Boolean(live && ((live.nslCode || '').toUpperCase().startsWith('EOD-') || live.status === 'UNDELIVERED'));

/**
 * What can be done about it, and if nothing, why not — the reason is shown to
 * the seller instead of a disabled button with no explanation.
 */
export function ndrVerdict(live?: NdrState | null) {
  const nsl = (live?.nslCode || '').toUpperCase();
  const attempts = live?.ndrAttempts || 0;
  const action = ndrActionFor(nsl);
  const rto = (live?.status || '').startsWith('RTO');
  const actionable = !!action && attempts >= 1 && attempts <= 2 && !rto;

  return {
    nsl: nsl || null,
    attempts,
    action,
    actionable,
    /** Whether we recognise the code at all — an unknown one is still shown. */
    known: !!action,
    rawStatus: live?.rawStatus ?? null,
    statusType: live?.statusType ?? null,
    label: action === 'PICKUP_RESCHEDULE' ? 'Reschedule pickup'
      : action === 'RE-ATTEMPT' ? 'Re-attempt delivery'
        : 'Delivery problem',
    blockedReason: actionable ? null
      : !action ? `No action is mapped for carrier code ${nsl || '—'}`
        : rto ? 'The parcel is already returning to you'
          : attempts === 0 ? 'No failed attempt recorded yet'
            : `${attempts} attempts already made — the carrier allows an action only after 1 or 2`,
    // The carrier's own words, never our paraphrase.
    reason: live?.instructions || live?.rawStatus || 'Delivery attempt failed',
  };
}

/**
 * Delhivery asks for NDR actions after 9 PM, once the day's dispatches are
 * closed and every exception parcel is back in the facility.
 */
export const beforeNdrWindow = () => new Date().getHours() < 21;
