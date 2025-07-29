import { prisma } from '~/server/prisma';
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);

  const category = await prisma.category.findMany({
    where: {
      companyId: session.data.companyId ,
    },
    select: {
      id:true,
      shortCut:true,
      fixedTax: true,
      taxBelowThreshold: true,
      taxAboveThreshold: true,
      thresholdAmount: true,
      taxType: true,
    },
  });

  if (!category) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Category not found',
    });
  }

  return category;
});
