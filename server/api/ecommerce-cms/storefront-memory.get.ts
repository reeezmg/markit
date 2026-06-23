import { prisma } from '~/server/prisma'

const DEFAULT_MEMORY = {
  theme: { primaryColor: '', accentColor: '', fontFamily: '', borderRadius: '', style: '' },
  brand: { name: '', tagline: '', tone: '', targetAudience: '', industry: '' },
  pages: {},
  sections: {},
  ideas: [],
  architecture: '',
  notes: '',
}

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)

  const row = await (prisma as any).storefrontMemory.findUnique({
    where: { companyId: session.data.companyId },
    select: { content: true },
  })

  return { content: row?.content ?? DEFAULT_MEMORY }
})
