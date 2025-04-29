import { type EnhancementContext, type EnhancementOptions } from '@zenstackhq/runtime';
import { type PrismaClient } from '../prisma/generated/client/edge';
import type * as _P from '../prisma/generated/client';
export type { PrismaClient };
/**
 * Infers the type of PrismaClient with ZenStack's enhancements.
 * @example
 * type EnhancedPrismaClient = Enhanced<typeof prisma>;
 */
export declare type Enhanced<Client> = Client;
export declare namespace auth {
    type WithRequired<T, K extends keyof T> = T & {
        [P in K]-?: T[P];
    };
    export type User = WithRequired<Partial<_P.User>, 'id'> & Record<string, unknown>;
    export {};
}
export declare function enhance<DbClient extends object>(prisma: DbClient, context?: EnhancementContext<auth.User>, options?: EnhancementOptions): DbClient;
