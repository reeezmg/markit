import { getHeadOfficeAdmin } from '~/server/utils/organizationAccess';

export default eventHandler(async event => {
  const session = await useAuthSession(event);
  if (session.data.id && session.data.companyId) {
    const allStores = Boolean(await getHeadOfficeAdmin(session.data.id, session.data.companyId));
    if (session.data.allStores !== allStores || session.data.organizationHeadOfficeId || session.data.readCompanyId) {
      await session.update({ ...session.data, allStores, organizationHeadOfficeId: undefined, readCompanyId: undefined });
    }
  }
  return session.data;
});
