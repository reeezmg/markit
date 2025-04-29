import type { User, Company, Address } from '~/prisma/generated/client';
import { prisma } from '../prisma';

export async function shopifyLogin(email: string) {
    return  prisma.user.findUnique({
        where: { email },
        select: {
            password:true,
            companies: {
                select: {
                    company: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });
}

export async function updateCompany(shopifyStoreName:string, shopifyAccessToken:string, companyId:string ) {
    console.log("donw")
    return prisma.company.update({
        where: { id:companyId },
        data: {
            shopifyStoreName,
            shopifyAccessToken,
          },
    });
}


