function inputNumber(value: unknown, signed: boolean, strict: boolean): number {
  const text = String(value ?? '').trim()
  if (!text) return 0
  const valid = (signed ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/ : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/).test(text)
  if (valid && Number.isFinite(Number(text))) return Number(text)
  if (!strict) return 0
  throw Error(signed
    ? 'Adjustment must be an amount: 2 adds ₹2 and -2 subtracts ₹2.'
    : 'Discount must be a percentage (2) or a deduction (-2). Do not use +.')
}

export const billDiscountValue = (value: unknown, strict = true) => inputNumber(value, false, strict)
export const billAdjustmentValue = (value: unknown, strict = true) => inputNumber(value, true, strict)

export function billTotal(base: number, discount: unknown, adjustment: unknown, redeemed = 0) {
  const value = billDiscountValue(discount, false)
  const deduction = value < 0 ? Math.abs(value) : base * value / 100
  return Number((base - deduction + billAdjustmentValue(adjustment, false)).toFixed(2)) - redeemed
}

/** Adopt old single-field charges without changing the saved total. */
export function splitBillDiscount(discount: unknown, adjustment: unknown, type?: string) {
  const surcharge = type === 'surcharge' || String(discount ?? '').trim().startsWith('+')
  return {
    discount: surcharge ? 0 : type === 'flat' ? -Math.abs(Number(discount) || 0) : typeof discount === 'string' ? discount : Number(discount) || 0,
    adjustment: (Number(adjustment) || 0) + (surcharge ? Math.abs(Number(discount) || 0) : 0),
  }
}
