export function expenseTaxAmounts(total: unknown, tax: unknown, recoverable: unknown) {
  const money=(value:unknown)=>{const n=Number(value);if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.00001)throw new Error('Amounts must be non-negative with at most two decimal places');return n;};
  const totalAmount=money(total);const taxAmount=money(tax ?? 0);
  if(taxAmount>totalAmount)throw new Error('Tax cannot exceed the total amount');
  if(taxAmount>0 && (recoverable===null || recoverable===undefined || recoverable===''))throw new Error('Choose whether the expense tax is recoverable');
  const recoverableTaxAmount=taxAmount===0?0:money(recoverable);
  if(recoverableTaxAmount>taxAmount)throw new Error('Recoverable tax cannot exceed tax amount');
  return {taxAmount,recoverableTaxAmount};
}
