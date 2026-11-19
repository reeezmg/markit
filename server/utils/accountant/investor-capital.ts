import { Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal.clone({ precision: 50, rounding: Prisma.Decimal.ROUND_HALF_UP });
export function capitalPosition(terms: any, capital: number) {
    return {capital, shares: Number(terms?.shares || 0), ownershipPercent: Number(terms?.ownershipPercent || 0), profitPercent: Number(terms?.profitPercent || 0)};
}
/** Prices belong to individual transactions, never an agreement or another purchase. */
export function calculateCapital(terms: any, capital: number, kind: string, amount: number | undefined, totalShares: number, price?: number, quantity?: number) {
    const before = capitalPosition(terms, capital), incoming = kind === 'CAPITAL_IN';
    let cash = new Decimal(amount || 0), delta = new Decimal(0), afterTerms = terms ? {...terms} : null;
    if (price !== undefined) {
        if (!(price > 0) || !totalShares) throw Error('Enter a positive price per share and configure total company shares');
        if (incoming) {
            if (!amount || amount <= 0) throw Error('Enter the amount invested');
            delta = cash.div(price).toDecimalPlaces(8);
            if (delta.eq(0) || delta.mul(price).minus(cash).abs().gt('0.01')) throw Error('Amount cannot be represented within one cent using eight decimal share places');
        } else {
            if (!quantity || quantity <= 0) throw Error('Enter shares to redeem');
            delta = new Decimal(quantity);
            if (delta.decimalPlaces() > 8) throw Error('Shares support up to eight decimal places');
            cash = delta.mul(price).toDecimalPlaces(2);
            if (cash.lte(0)) throw Error('Redemption value must be at least 0.01');
            if (amount !== undefined && !cash.eq(amount)) throw Error('Redemption amount must match shares multiplied by transaction price');
            delta = delta.negated();
        }
        const shares = new Decimal(before.shares).plus(delta);
        if (shares.lt(0)) throw Error('Cannot redeem more shares than this investor holds');
        if (!new Decimal(shares.toNumber()).eq(shares)) throw Error('Share result exceeds supported numeric precision');
        const percent = shares.div(totalShares).mul(100).toDecimalPlaces(8).toNumber();
        afterTerms = {trackingMode:'SHARES',shares:shares.toNumber(),totalShares,ownershipPercent:percent,profitPercent:percent,shareClass:terms?.shareClass || 'Ordinary',note:'Share transaction'};
    }
    if (cash.lte(0) || cash.decimalPlaces() > 2) throw Error('Enter a positive amount with up to two decimal places');
    return {before,after:capitalPosition(afterTerms,new Decimal(capital).plus(incoming ? cash : cash.negated()).toNumber()),afterTerms,amount:cash.toNumber(),shareDelta:delta.toNumber(),pricePerShare:price ?? null,shareQuantity:delta.abs().toNumber()};
}
