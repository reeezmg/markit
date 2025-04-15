import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getUserCompanies = async (userId: string) => {
    try {
        const companies = await prisma.company.findMany({
            where: {
                users: {
                    some: {
                        userId: userId,
                    },
                },
            },
            include: {
                users: true,
                products: true,
                categories: true,
            },
        });
        return companies;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
};
