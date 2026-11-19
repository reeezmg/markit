import { cents } from './posting';
export const isShareTrade = (event: any) => ['SHARE_BUY','SHARE_REDEEM'].includes(event.kind);
export function shareDues(events: any[], asOf = '9999-12-31') {
    const visible = events.filter(e => new Date(e.event_date).toISOString().slice(0,10) <= asOf);
    const reversed=new Set(visible.filter(e=>e.reversed_id).map(e=>e.reversed_id)), payments=new Map<string,number>();
    for(const e of visible) if(e.details?.settleTradeId && e.journal_status==='PUBLISHED' && !e.journal_deleted) payments.set(e.details.settleTradeId,(payments.get(e.details.settleTradeId)||0)+cents(e.amount)*(e.kind==='REVERSAL'?-1:1));
    return visible.filter(isShareTrade).map(trade => {
        const cancelled = reversed.has(trade.id), paidCents=payments.get(trade.id)||0;
        const totalCents = cents(trade.amount), due = (totalCents - paidCents) / 100;
        return {id:trade.id,kind:trade.kind,date:new Date(trade.event_date).toISOString().slice(0,10),total:totalCents/100,paid:paidCents/100,due:cancelled ? 0 : due,cancelled,
            status:cancelled ? 'CANCELLED' : paidCents === totalCents ? 'PAID' : paidCents ? 'PARTIAL' : 'DUE',
            capitalKind:trade.kind === 'SHARE_BUY' ? 'CAPITAL_IN' : 'CAPITAL_OUT',pricePerShare:trade.details.pricePerShare,shareQuantity:trade.details.capitalPreview?.shareQuantity};
    });
}
export function shareDueTotals(events: any[], asOf?: string) {
    const trades = shareDues(events,asOf);
    return {shareCapitalDue:trades.filter(t=>t.kind==='SHARE_BUY').reduce((s,t)=>s+Math.round(t.due*100),0)/100,
        shareRedemptionDue:trades.filter(t=>t.kind==='SHARE_REDEEM').reduce((s,t)=>s+Math.round(t.due*100),0)/100};
}
