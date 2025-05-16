export default defineEventHandler(async () => {
  const categories = await prisma.category.findMany({
    where: { status: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })
  return categories
})
