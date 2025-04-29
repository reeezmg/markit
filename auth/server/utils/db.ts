import type { User, Company, Address, Pipeline } from '~/prisma/generated/client';
import { prisma } from '~/server/prisma';
import type { Prisma } from '~/prisma/generated/client';


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

export async function findUserById(id: string) {
    return prisma.user.findUnique({
        where: { id },
    });
}

export async function createUser(user: Prisma.UserCreateInput) {
    return prisma.user.create({
        data: user,
    });
}
export async function createCompany(company: Prisma.CompanyCreateInput) {
    return prisma.company.create({
        data: company,
    });
}
export async function updatePassword(id: string,password:string) {
    return prisma.user.update({
        where: { id },
            data: {
               password: password,
            },
    });
}

export async function updateUser(id: string,companyId:string) {
    return prisma.user.update({
        where: { id },
            data: {
                companies: {
                    create: [{ company: { connect: { id: companyId} } }],
                },
            },
    });
}

export async function createAddress(address: Omit<Address, 'id'>) {
    return prisma.address.create({
        data: address,
    });
}

export async function createPipeline(pipeline: Prisma.PipelineCreateInput) {
    return prisma.pipeline.create({
        data: pipeline,
    });
}
