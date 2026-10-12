import { getHeadOfficeAdmin } from '~/server/utils/organizationAccess';
import { loadSelectedAccounts } from '~/server/utils/selected-accounts';
import { packSelectedAccounts, unpackSelectedAccounts } from '~/server/utils/selected-accounts-codec';

export default eventHandler(async event => {
  const session = await useAuthSession(event);
  let selectedAccounts = unpackSelectedAccounts(session.data.selectedAccountsPacked);
  if (session.data.id && session.data.companyId) {
    if (selectedAccounts?.companyId !== session.data.companyId || selectedAccounts?.version !== 2) {
      selectedAccounts = await loadSelectedAccounts(session.data.companyId);
      await session.update({ selectedAccounts: undefined, selectedAccountsPacked: packSelectedAccounts(selectedAccounts) });
    }
    const allStores = Boolean(await getHeadOfficeAdmin(session.data.id, session.data.companyId));
    if (session.data.allStores !== allStores || session.data.organizationHeadOfficeId || session.data.readCompanyId) {
      await session.update({ ...session.data, allStores, organizationHeadOfficeId: undefined, readCompanyId: undefined });
    }
  }
  const { selectedAccountsPacked, ...data } = session.data;
  return { ...data, selectedAccounts };
});
