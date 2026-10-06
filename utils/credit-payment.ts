// Settling a split bill changes only the unpaid credit portion.
export function settleCreditPayment(bill: any, status: string, method?: string) {
  if (status !== 'PAID') {
    if(status==='PENDING' && bill.payment_method!=='Split') return {method:'Credit',splits:null};
    if(status==='PENDING' && bill.payment_status==='PAID' && bill.payment_method==='Split') throw Error('Edit the split bill to specify the unpaid credit amount');
    return {method:bill.payment_method,splits:bill.split_payments};
  }
  if (!['Cash','UPI','Card','Bank','Cheque'].includes(method || '')) throw Error('Select a payment method');
  if (bill.payment_method !== 'Split') return {method, splits: null};
  if (!Array.isArray(bill.split_payments)) throw Error('Invalid split payments');
  const cents = (value: any) => { const n=Number(value); if (!Number.isFinite(n)) throw Error('Invalid split amount'); return Math.round(n*100); };
  if (bill.split_payments.reduce((sum: number, part: any) => sum+cents(part.amount),0) !== cents(bill.grand_total)) throw Error('Split payments must equal invoice total');
  return {method:'Split',splits:bill.split_payments.map((part: any) => String(part.method).toLowerCase()==='credit' ? {...part,method} : part)};
}
