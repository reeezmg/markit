
import { PrismaClient } from '@prisma/client'
import distributorPaymentMiddleware from './utils/distributorPayment.middleware'

const prisma = new PrismaClient()
prisma.$use(distributorPaymentMiddleware)

export { prisma }
