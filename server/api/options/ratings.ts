export default defineEventHandler(async () => {
  const ratings = await prisma.product.findMany({
    where: { status: true },
    select: { rating: true },
    distinct: ['rating'],
    orderBy: { rating: 'asc' }
  })

  return ratings
    .map(r => r.rating)
    .filter(r => r !== null)
    .map(rating => ({ label: rating.toString(), value: rating.toString() }))
})
