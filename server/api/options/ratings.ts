export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const ratings = await prisma.product.findMany({
     where: { 
      status: true,
      companyId: session.data.companyId, 
    },
    select: { rating: true },
    distinct: ['rating'],
    orderBy: { rating: 'asc' }
  })

  return ratings
    .map(r => r.rating)
    .filter(r => r !== null)
    .map(rating => ({ label: rating.toString(), value: rating.toString() }))
})
