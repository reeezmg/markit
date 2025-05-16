export default defineEventHandler(async () => {
  const brands = await prisma.product.findMany({
    where: { status: true },
    select: { brand: true },
    distinct: ['brand'],
    orderBy: { brand: 'asc' }
  })

  return brands
    .map(b => b.brand)
    .filter(Boolean)
    .map(brand => ({ label: brand, value: brand }))
})
