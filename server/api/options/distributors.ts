export default defineEventHandler(async (event) => {
   const session = await useAuthSession(event);
  const distributors = await prisma.distributor.findMany({
    where: { 
      status: true,
      companies:{
        some:{companyId: session.data.companyId}
      }
      
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return distributors
})
