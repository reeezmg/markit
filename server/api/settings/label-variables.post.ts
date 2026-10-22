import { defineEventHandler, readBody, createError } from 'h3';
import { z } from 'zod';
import { prisma } from '~/server/prisma';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { readLabelVariables } from '~/server/utils/labelVariables';

const requestSchema = z.object({
  itemIds: z.array(z.string().min(1).max(100)).max(500).default([]),
  barcodes: z.array(z.string().min(1).max(200)).max(500).default([]),
}).refine(body => body.itemIds.length + body.barcodes.length > 0 && body.itemIds.length + body.barcodes.length <= 500);
export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  const parsed = requestSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose up to 500 label items' });
  return readLabelVariables(prisma, session.data.companyId, parsed.data.itemIds, parsed.data.barcodes);
});
