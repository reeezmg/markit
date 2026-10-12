import { loadSelectedAccounts } from '~/server/utils/selected-accounts';
import { packSelectedAccounts } from '~/server/utils/selected-accounts-codec';
import { assertCompanyAccess } from '~/server/utils/companyRequestScope';

export default eventHandler(async event => {
  const session = await requireAuthSession(event);
  const body = await readBody(event);
  const companyId = body?.companyId || session.data.companyId;
  await assertCompanyAccess(event, companyId);
  const selectedAccounts = await loadSelectedAccounts(companyId);
  // A form owned by another authorized store must not replace this login's defaults.
  if (companyId === session.data.companyId) await session.update({ selectedAccounts: undefined, selectedAccountsPacked: packSelectedAccounts(selectedAccounts) });
  return selectedAccounts;
});
