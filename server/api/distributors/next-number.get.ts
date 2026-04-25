import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);

  const company = await prisma.company.findUnique({
    where: { id: session.data.companyId },
    select: {
      distributorCounter: true, distributorPrefix: true,
      distributorPaymentCounter: true, distributorPaymentPrefix: true,
      distributorCreditCounter: true, distributorCreditPrefix: true,
    },
  });

  if (!company) {
    throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  }

  const distPrefix = company.distributorPrefix || 'DIST';
  const dpPrefix = company.distributorPaymentPrefix || 'DP';
  const dcPrefix = company.distributorCreditPrefix || 'DC';

  return {
    distributorNumber: distPrefix ? `${distPrefix}-${company.distributorCounter}` : company.distributorCounter,
    distributorPaymentNumber: dpPrefix ? `${dpPrefix}-${company.distributorPaymentCounter}` : company.distributorPaymentCounter,
    distributorCreditNumber: dcPrefix ? `${dcPrefix}-${company.distributorCreditCounter}` : company.distributorCreditCounter,
  };
});
