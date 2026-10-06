import { z } from 'zod';
import { Router } from './router';
import { accountantPrisma as prisma } from './context';

export const directoryRouter = Router();
for (const [route, model] of [['parties', 'party'], ['projects', 'project']]) {
  directoryRouter.get(`/${route}`, async (_req, res) => {
    res.json({ data: await prisma[model].findMany({ orderBy: { name: 'asc' } }) });
  });
  directoryRouter.post(`/${route}`, async (req, res) => {
    const common = z.object({ name: z.string().trim().min(1).max(150) });
    const schema = model === 'party' ? common.extend({
      type: z.enum(['CLIENT', 'VENDOR', 'OTHER']).default('CLIENT'),
      email: z.union([z.string().email(), z.literal('')]).optional(), phone: z.string().max(40).optional(),
    }) : common.extend({ description: z.string().max(1000).optional() });
    res.status(201).json(await prisma[model].create({ data: schema.parse(req.body) }));
  });
}
