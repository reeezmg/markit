// An explicit reviewed snapshot accepts only its exact conflicts and final balances.
export function applyReview(plan, review) {
  if (!review) return plan;
  const allowed = new Set(review.conflicts.map(c => JSON.stringify(c)));
  const accepted = plan.conflicts.filter(c => allowed.has(JSON.stringify(c)));
  const conflicts = plan.conflicts.filter(c => !allowed.has(JSON.stringify(c)));
  for (const row of plan.reconciliation) {
    const expected = review.reconciliation.find(r => r.accountId === row.accountId);
    if (!expected || expected.oldBalance !== row.oldBalance || expected.newBalanceAfter !== row.newBalanceAfter)
      conflicts.push({account:row.account,reason:'Reviewed old or projected new balance changed'});
  }
  return {...plan, conflicts, acceptedConflicts:accepted};
}
