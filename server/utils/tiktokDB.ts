import type { User, Company, Address } from '@prisma/client';
import { prisma } from '../prisma';



export async function updateCompanyForTiktok(tiktokAccessToken:string, tiktokAccessTokenExpireIn:number, tiktokRefreshToken:string, tiktokRefreshTokenExpireIn:number, companyId:string,tiktokCipher:string,tiktokStoreName:string ) {
    return prisma.company.update({
        where: { id:companyId },
        data: {
            tiktokAccessToken,
            tiktokAccessTokenExpireIn,
            tiktokRefreshToken,
            tiktokRefreshTokenExpireIn,
            tiktokCipher,
            tiktokStoreName

          },
    });
}


