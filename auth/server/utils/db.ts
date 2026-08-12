import type { Address } from '@prisma/client';
import { prisma } from '~/server/prisma';
import type { Prisma } from '@prisma/client';


export async function findUserByEmail(email: string) {
    return prisma.user.findUnique({
        where: { email },
        include:{ 
                companies:{ 
                        include:{ 
                            company: {
                                include:{
                                    pipeline:true,
                                    productinput: true,
                                    variantinput: true,
                                    address:true,
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

/**
 * Creates a company plus everything a new company needs (owner CompanyUser link,
 * default 'Purchase' expense category, pipeline) in a single transaction.
 * If any step fails, nothing is persisted — no orphan company or user is left behind.
 */
export async function registerCompanyWithOwner(params: {
    company: Prisma.CompanyCreateInput;
    email: string;
    hashedPassword: string;
    name: string;
    /** Set when the email already has a User row — links that user to the new company instead of creating one. */
    existingUserId?: string;
}) {
    const { company, email, hashedPassword, name, existingUserId } = params;

    return prisma.$transaction(
        async (tx) => {
            const createdCompany = await tx.company.create({
                data: company,
            });

            const companyUser = {
                company: { connect: { id: createdCompany.id } },
                role: 'admin' as const,
                code: 1,
                name,
            };

            if (existingUserId) {
                await tx.user.update({
                    where: { id: existingUserId },
                    data: { companies: { create: [companyUser] } },
                });
            } else {
                await tx.user.create({
                    data: {
                        email,
                        password: hashedPassword,
                        companies: { create: [companyUser] },
                    },
                });
            }

            await tx.expenseCategory.create({
                data: {
                    name: 'Purchase',
                    companyId: createdCompany.id,
                    status: true,
                },
            });

            await tx.pipeline.create({
                data: { company: { connect: { id: createdCompany.id } } },
            });

            return createdCompany;
        },
        { maxWait: 10000, timeout: 20000 },
    );
}

export async function updatePassword(id: string,password:string) {
    return prisma.user.update({
        where: { id },
            data: {
               password: password,
            },
    });
}

export async function createAddress(address: Omit<Address, 'id'>) {
    return prisma.address.create({
        data: address,
    });
}

export async function getPurchaseExpenseCategoryId(companyId: string) {
  const category = await prisma.expenseCategory.findFirst({
    where: {
      name: 'Purchase',
      companyId,
    },
    select: {
      id: true,
    },
  });

  if (!category) {
    throw new Error('Purchase expense category not found for company');
  }

  return category.id;
}
