import { z } from 'zod';
/**
 * `DistributorCompany` schema excluding foreign keys and relations.
 */
export declare const DistributorCompanyScalarSchema: z.ZodObject<{
    distributorId: z.ZodString;
    companyId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    companyId: string;
    distributorId: string;
}, {
    companyId: string;
    distributorId: string;
}>;
/**
 * `DistributorCompany` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const DistributorCompanySchema: z.ZodObject<{} & {
    distributorId: z.ZodString;
    companyId: z.ZodString;
} & {
    distributor: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    distributorId: string;
    company?: Record<string, unknown> | undefined;
    distributor?: Record<string, unknown> | undefined;
}, {
    companyId: string;
    distributorId: string;
    company?: Record<string, unknown> | undefined;
    distributor?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const DistributorCompanyPrismaCreateSchema: z.ZodObject<{
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const DistributorCompanyPrismaUpdateSchema: z.ZodObject<{
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `DistributorCompany` schema for create operations excluding foreign keys and relations.
 */
export declare const DistributorCompanyCreateScalarSchema: z.ZodObject<{
    distributorId: z.ZodString;
    companyId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    companyId: string;
    distributorId: string;
}, {
    companyId: string;
    distributorId: string;
}>;
/**
 * `DistributorCompany` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorCompanyCreateSchema: z.ZodObject<{} & {
    distributorId: z.ZodString;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    distributorId: string;
}, {
    companyId: string;
    distributorId: string;
}>;
/**
 * `DistributorCompany` schema for update operations excluding foreign keys and relations.
 */
export declare const DistributorCompanyUpdateScalarSchema: z.ZodObject<{
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    companyId?: string | undefined;
    distributorId?: string | undefined;
}, {
    companyId?: string | undefined;
    distributorId?: string | undefined;
}>;
/**
 * `DistributorCompany` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorCompanyUpdateSchema: z.ZodObject<{} & {
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    distributorId?: string | undefined;
}, {
    companyId?: string | undefined;
    distributorId?: string | undefined;
}>;
