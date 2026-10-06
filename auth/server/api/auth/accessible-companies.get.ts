import { listAccessibleCompanies } from '~/server/utils/organizationAccess';

export default eventHandler(async (event) => {
  const session = await requireAuthSession(event);
  return listAccessibleCompanies(session.data.id);
});
