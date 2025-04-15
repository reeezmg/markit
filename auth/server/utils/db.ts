import type { User, Company, Address, Pipeline } from '@prisma/client';
import { prisma } from '~/server/prisma';

export async function findUserByEmail(email: string) {
    return prisma.user.findUnique({
        where: { email },
        include:{ 
                companies:{ 
                        include:{ 
                            company: {
                                include:{
                                    pipeline:true
                                }
                            } 

                        } 
                    } 
            },
    });
}

export async function createUser(user: Omit<User, 'id'>) {
    return prisma.user.create({
        data: user,
    });
}
export async function createCompany(company: Omit<Company, 'id'>) {
    return prisma.company.create({
        data: company,
    });
}

export async function createAddress(address: Omit<Address, 'id'>) {
    return prisma.address.create({
        data: address,
    });
}

export async function createPipeline(pipeline: Omit<Pipeline, 'id'>) {
    return prisma.pipeline.create({
        data: pipeline,
    });
}
