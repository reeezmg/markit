import { z } from 'zod';
/**
 * `CompanyUser` schema excluding foreign keys and relations.
 */
export declare const CompanyUserScalarSchema: z.ZodObject<{
    companyId: z.ZodString;
    userId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    companyId: string;
    userId: string;
}, {
    companyId: string;
    userId: string;
}>;
/**
 * `CompanyUser` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const CompanyUserSchema: z.ZodObject<{} & {
    companyId: z.ZodString;
    userId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    user: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    userId: string;
    company?: Record<string, unknown> | undefined;
    user?: Record<string, unknown> | undefined;
}, {
    companyId: string;
    userId: string;
    company?: Record<string, unknown> | undefined;
    user?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const CompanyUserPrismaCreateSchema: z.ZodObject<{
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const CompanyUserPrismaUpdateSchema: z.ZodObject<{
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `CompanyUser` schema for create operations excluding foreign keys and relations.
 */
export declare const CompanyUserCreateScalarSchema: z.ZodObject<{
    companyId: z.ZodString;
    userId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    companyId: string;
    userId: string;
}, {
    companyId: string;
    userId: string;
}>;
/**
 * `CompanyUser` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const CompanyUserCreateSchema: z.ZodObject<{} & {
    companyId: z.ZodString;
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    userId: string;
}, {
    companyId: string;
    userId: string;
}>;
/**
 * `CompanyUser` schema for update operations excluding foreign keys and relations.
 */
export declare const CompanyUserUpdateScalarSchema: z.ZodObject<{
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    companyId?: string | undefined;
    userId?: string | undefined;
}, {
    companyId?: string | undefined;
    userId?: string | undefined;
}>;
/**
 * `CompanyUser` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const CompanyUserUpdateSchema: z.ZodObject<{} & {
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    userId?: string | undefined;
}, {
    companyId?: string | undefined;
    userId?: string | undefined;
}>;
