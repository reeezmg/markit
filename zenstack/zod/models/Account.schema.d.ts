import { z } from 'zod';
/**
 * `Account` schema excluding foreign keys and relations.
 */
export declare const AccountScalarSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    phone: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    phone: string;
}, {
    id: string;
    name: string;
    phone: string;
}>;
/**
 * `Account` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const AccountSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    phone: z.ZodString;
} & {
    companyId: z.ZodString;
} & {
    bill: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    phone: string;
    companyId: string;
    company?: Record<string, unknown> | undefined;
    address?: Record<string, unknown> | undefined;
    bill?: unknown[] | undefined;
}, {
    id: string;
    name: string;
    phone: string;
    companyId: string;
    company?: Record<string, unknown> | undefined;
    address?: Record<string, unknown> | undefined;
    bill?: unknown[] | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const AccountPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const AccountPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Account` schema for create operations excluding foreign keys and relations.
 */
export declare const AccountCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    phone: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
    phone: string;
    id?: string | undefined;
}, {
    name: string;
    phone: string;
    id?: string | undefined;
}>;
/**
 * `Account` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const AccountCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    phone: z.ZodString;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    phone: string;
    companyId: string;
    id?: string | undefined;
}, {
    name: string;
    phone: string;
    companyId: string;
    id?: string | undefined;
}>;
/**
 * `Account` schema for update operations excluding foreign keys and relations.
 */
export declare const AccountUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    phone?: string | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    phone?: string | undefined;
}>;
/**
 * `Account` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const AccountUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    companyId?: string | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    companyId?: string | undefined;
}>;
