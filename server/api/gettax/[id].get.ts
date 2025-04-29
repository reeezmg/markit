import { prisma } from '~/server/prisma';
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Category ID is required',
    });
  }

  const category = await prisma.category.findUnique({
    where: { id },
    select: {
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
