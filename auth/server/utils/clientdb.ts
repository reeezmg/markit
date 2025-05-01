import type { User, Company, Address, Pipeline } from '@prisma/client';
import { pipeline } from 'stream';
import { prisma } from '~/server/prisma';

export async function findClientByPhone(phone: string) {
    return prisma.client.findUnique({
        where: { phone },
    });
}

export async function createClient(client: Omit<Client, 'id'>) {
    return prisma.client.create({
        data: client,
    });
}


export async function createClientAddress(address: Omit<Address, 'id'>) {
    return prisma.address.create({
        data: address,
    });
}


export async function updateClientPipeline(clientId: string, companyId: string) {
    return prisma.pipeline.update({
       where: { companyId },
       data: {
          newClients: {
              connect: { id: clientId }  // Corrected the syntax here
          }
       }
    });
}