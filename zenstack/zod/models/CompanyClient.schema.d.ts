import { z } from 'zod';
/**
 * `CompanyClient` schema excluding foreign keys and relations.
 */
export declare const CompanyClientScalarSchema: z.ZodObject<{
    companyId: z.ZodString;
    clientId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
}, {
    companyId: string;
    clientId: string;
}>;
/**
 * `CompanyClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const CompanyClientSchema: z.ZodObject<{} & {
    companyId: z.ZodString;
    clientId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    client: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
    company?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
}, {
    companyId: string;
    clientId: string;
    company?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const CompanyClientPrismaCreateSchema: z.ZodObject<{
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const CompanyClientPrismaUpdateSchema: z.ZodObject<{
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `CompanyClient` schema for create operations excluding foreign keys and relations.
 */
export declare const CompanyClientCreateScalarSchema: z.ZodObject<{
    companyId: z.ZodString;
    clientId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
}, {
    companyId: string;
    clientId: string;
}>;
/**
 * `CompanyClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const CompanyClientCreateSchema: z.ZodObject<{} & {
    companyId: z.ZodString;
    clientId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
}, {
    companyId: string;
    clientId: string;
}>;
/**
 * `CompanyClient` schema for update operations excluding foreign keys and relations.
 */
export declare const CompanyClientUpdateScalarSchema: z.ZodObject<{
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    companyId?: string | undefined;
    clientId?: string | undefined;
}, {
    companyId?: string | undefined;
    clientId?: string | undefined;
}>;
/**
 * `CompanyClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const CompanyClientUpdateSchema: z.ZodObject<{} & {
    companyId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    clientId?: string | undefined;
}, {
    companyId?: string | undefined;
    clientId?: string | undefined;
}>;
