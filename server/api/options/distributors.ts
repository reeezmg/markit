export default defineEventHandler(async () => {
  const distributors = await prisma.distributor.findMany({
    where: { status: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return distributors
})
