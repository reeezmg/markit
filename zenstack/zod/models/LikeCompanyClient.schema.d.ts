import { z } from 'zod';
/**
 * `LikeCompanyClient` schema excluding foreign keys and relations.
 */
export declare const LikeCompanyClientScalarSchema: z.ZodObject<{
    likeId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    likeId: string;
}, {
    likeId: string;
}>;
/**
 * `LikeCompanyClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const LikeCompanyClientSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    companyId: z.ZodString;
    likeId: z.ZodString;
} & {
    client: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    like: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
    likeId: string;
    company?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    like?: Record<string, unknown> | undefined;
}, {
    companyId: string;
    clientId: string;
    likeId: string;
    company?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    like?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const LikeCompanyClientPrismaCreateSchema: z.ZodObject<{
    likeId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    likeId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    likeId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const LikeCompanyClientPrismaUpdateSchema: z.ZodObject<{
    likeId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    likeId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    likeId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `LikeCompanyClient` schema for create operations excluding foreign keys and relations.
 */
export declare const LikeCompanyClientCreateScalarSchema: z.ZodObject<{
    likeId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    likeId: string;
}, {
    likeId: string;
}>;
/**
 * `LikeCompanyClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const LikeCompanyClientCreateSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    companyId: z.ZodString;
    likeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
    likeId: string;
}, {
    companyId: string;
    clientId: string;
    likeId: string;
}>;
/**
 * `LikeCompanyClient` schema for update operations excluding foreign keys and relations.
 */
export declare const LikeCompanyClientUpdateScalarSchema: z.ZodObject<{
    likeId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    likeId?: string | undefined;
}, {
    likeId?: string | undefined;
}>;
/**
 * `LikeCompanyClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const LikeCompanyClientUpdateSchema: z.ZodObject<{} & {
    clientId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
    likeId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    clientId?: string | undefined;
    likeId?: string | undefined;
}, {
    companyId?: string | undefined;
    clientId?: string | undefined;
    likeId?: string | undefined;
}>;
