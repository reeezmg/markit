import { createHash } from 'node:crypto';
export const IMPORT_TYPE = 'LEGACY_CASH_BANK_HISTORY';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function cents(value) {
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`Not an exact two-decimal amount: ${value}`);
  return BigInt(match[2]) * (match[1] ? -100n : 100n) + BigInt((match[3] || '').padEnd(2, '0')) * (match[1] ? -1n : 1n);
}
export function money(value) {
  const n = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
}
const sum = (values) => values.reduce((a,b) => a+b, 0n);
const vector = (rows) => {
  const result = new Map();
  for (const row of rows) {
    const key = `${row.account_id}|${row.date}`;
    const n = cents(row.amount) * (row.side === 'DEBIT' ? 1n : -1n);
    result.set(key, (result.get(key) || 0n) + n);
  }
  return JSON.stringify([...result].filter(([,n]) => n !== 0n).sort(([a],[b]) => a.localeCompare(b)).map(([k,n]) => [k,money(n)]));
};

// Plan only; no I/O. Original document IDs, never fuzzy amount/date matches, identify duplicates.
export function planHistory({companyId, rows, native, imports, targets, balances, offsetAccountId}) {
  const conflicts = [], journals = [], reused = [], unchanged = [];
  const groups = new Map(), claimed = new Map(), seenImports = new Set();
  const expected = Object.fromEntries(Object.values(targets).map(id => [id,0n]));
  for (const row of rows) {
    if (!(row.account_type in targets)) throw new Error('Unexpected legacy account type');
    if (!['CREDIT','DEBIT'].includes(row.direction) || cents(row.amount) < 0n) throw new Error('Invalid legacy ledger amount or direction');
    const key = `${row.source_type}:${row.source_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    expected[targets[row.account_type]] += cents(row.amount) * (row.direction === 'CREDIT' ? 1n : -1n);
  }
  for (const [key, group] of groups) {
    const desired = group.map(r => ({account_id:targets[r.account_type],date:r.date,side:r.direction==='CREDIT'?'DEBIT':'CREDIT',amount:r.amount}));
    const existing = native[key] || [];
    const dates = [...new Set(group.map(r => r.date))].sort();
    if (existing.length) {
      const posting = existing.flatMap(j => j.lines);
      if (vector(posting) !== vector(desired)) conflicts.push({source:key,reason:'Existing source posting differs in account, date or amount',legacy:JSON.parse(vector(desired)),posted:JSON.parse(vector(posting))});
      for (const j of existing) {
        if (claimed.has(j.id) && claimed.get(j.id)!==key) conflicts.push({source:key,reason:'Two legacy sources refer to the same posted journal',also:claimed.get(j.id),journalId:j.id});
        claimed.set(j.id,key);
      }
      reused.push({source:key,journalIds:existing.map(j=>j.id)});
    }
    for (const date of dates) {
      const sourceId=hash(`${key}|${date}`);
      seenImports.add(sourceId);
      const originals=group.filter(r=>r.date===date).map(r=>({account:r.account_type,direction:r.direction,amount:money(cents(r.amount)),date:r.date,note:r.note||''})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const fingerprint=hash(JSON.stringify({key,date,targets,rows:originals}));
      const prior=imports[sourceId];
      if(prior){
        if(existing.length) conflicts.push({source:key,reason:'Legacy import and native posting both exist; review before continuing'});
        if(prior.valid===false || prior.fingerprint!==fingerprint || vector(prior.lines)!==vector(desired.filter(r=>r.date===date))) conflicts.push({source:key,reason:'An imported source changed; immutable history must be reviewed'});
        if(offsetAccountId && prior.offsetAccountId && prior.offsetAccountId!==offsetAccountId) conflicts.push({source:key,reason:'Offset account differs from the previous import'});
        unchanged.push({source:key,journalId:prior.id});continue;
      }
      if(existing.length)continue;
      const id='c'+hash(`${companyId}|${IMPORT_TYPE}|${sourceId}`).slice(0,24);
      const lines=desired.filter(r=>r.date===date && cents(r.amount)!==0n).map((r,i)=>({...r,id:'c'+hash(`${id}|${i}`).slice(0,24)}));
      if(!lines.length)continue;
      const net=sum(lines.map(l=>cents(l.amount)*(l.side==='DEBIT'?1n:-1n)));
      if(net!==0n)lines.push({id:'c'+hash(`${id}|offset`).slice(0,24),account_id:offsetAccountId||'OFFSET_ACCOUNT_REQUIRED',date,side:net>0n?'CREDIT':'DEBIT',amount:money(net>0n?net:-net)});
      journals.push({id,sourceId,source:key,date,fingerprint,entryNumber:'LCB-'+hash(id).slice(0,16).toUpperCase(),
        notes:originals.map(r=>r.note).filter(Boolean).join(' | ').slice(0,1000)||key,lines,total:money(sum(lines.filter(l=>l.side==='DEBIT').map(l=>cents(l.amount))))});
    }
  }
  for(const [key,prior] of Object.entries(imports)) if(!seenImports.has(key)) conflicts.push({journalId:prior.id,reason:'Previously imported source is absent from the old ledger'});
  const reconciliation=Object.entries(targets).map(([account,id])=>{
    const before=cents(balances[id]||'0');
    const added=sum(journals.flatMap(j=>j.lines).filter(l=>l.account_id===id).map(l=>cents(l.amount)*(l.side==='DEBIT'?1n:-1n)));
    const difference=before+added-expected[id];
    if(difference!==0n)conflicts.push({account,reason:'Projected balance does not match the old ledger; unlinked postings may exist',difference:money(difference)});
    return {account,accountId:id,oldBalance:money(expected[id]),newBalanceBefore:money(before),toImport:money(added),newBalanceAfter:money(before+added),difference:money(difference)};
  });
  return {journals,conflicts,reused,unchanged,reconciliation};
}
