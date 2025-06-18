import { z } from 'zod';
/**
 * `UserClient` schema excluding foreign keys and relations.
 */
export declare const UserClientScalarSchema: z.ZodObject<{
    clientId: z.ZodString;
    userId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    clientId: string;
    userId: string;
}, {
    clientId: string;
    userId: string;
}>;
/**
 * `UserClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const UserClientSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    userId: z.ZodString;
} & {
    client: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    user: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    userId: string;
    user?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
}, {
    clientId: string;
    userId: string;
    user?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const UserClientPrismaCreateSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const UserClientPrismaUpdateSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `UserClient` schema for create operations excluding foreign keys and relations.
 */
export declare const UserClientCreateScalarSchema: z.ZodObject<{
    clientId: z.ZodString;
    userId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    clientId: string;
    userId: string;
}, {
    clientId: string;
    userId: string;
}>;
/**
 * `UserClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const UserClientCreateSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    userId: string;
}, {
    clientId: string;
    userId: string;
}>;
/**
 * `UserClient` schema for update operations excluding foreign keys and relations.
 */
export declare const UserClientUpdateScalarSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    clientId?: string | undefined;
    userId?: string | undefined;
}, {
    clientId?: string | undefined;
    userId?: string | undefined;
}>;
/**
 * `UserClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const UserClientUpdateSchema: z.ZodObject<{} & {
    clientId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    clientId?: string | undefined;
    userId?: string | undefined;
}, {
    clientId?: string | undefined;
    userId?: string | undefined;
}>;
