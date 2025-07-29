export default defineEventHandler(async (event) => {
   const session = await useAuthSession(event);
  const categories = await prisma.category.findMany({
    where: { 
      status: true,
      companyId: session.data.companyId, 
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })
  return categories
})
