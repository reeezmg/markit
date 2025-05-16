export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event);
  const brands = await prisma.product.findMany({
    where: { 
      status: true,
      companyId: session.data.companyId, 
    },
    select: { brand: true },
    distinct: ['brand'],
    orderBy: { brand: 'asc' }
  })

  return brands
    .map(b => b.brand)
    .filter(Boolean)
    .map(brand => ({ label: brand, value: brand }))
})
