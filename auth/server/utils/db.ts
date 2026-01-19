import type { User, Company, Address, Pipeline } from '@prisma/client';
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

export async function createUser(user: Prisma.UserCreateInput) {
    return prisma.user.create({
        data: user,
    });
}
export async function createCompany(company: Prisma.CompanyCreateInput) {
    console.log(company)
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

export async function updateUser(
  userId: string,
  companyId: string,
  name: string,
  role: 'admin' | 'user',
  code: string
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      companies: {
        create: [
          {
            company: { connect: { id: companyId } },
            name,
            role,
            code
          },
        ],
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

export async function createDefaultExpenseCategories(companyId: string) {
  await prisma.expenseCategory.create({
    data: {
      name: 'Purchase',
      companyId,
      status: true,
    },
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
