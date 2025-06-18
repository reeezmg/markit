import { z } from 'zod';
/**
 * `CartCompanyClient` schema excluding foreign keys and relations.
 */
export declare const CartCompanyClientScalarSchema: z.ZodObject<{
    cartId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    cartId: string;
}, {
    cartId: string;
}>;
/**
 * `CartCompanyClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const CartCompanyClientSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    companyId: z.ZodString;
    cartId: z.ZodString;
} & {
    client: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    cart: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
    cartId: string;
    company?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    cart?: Record<string, unknown> | undefined;
}, {
    companyId: string;
    clientId: string;
    cartId: string;
    company?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    cart?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const CartCompanyClientPrismaCreateSchema: z.ZodObject<{
    cartId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    cartId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    cartId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const CartCompanyClientPrismaUpdateSchema: z.ZodObject<{
    cartId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    cartId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    cartId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `CartCompanyClient` schema for create operations excluding foreign keys and relations.
 */
export declare const CartCompanyClientCreateScalarSchema: z.ZodObject<{
    cartId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    cartId: string;
}, {
    cartId: string;
}>;
/**
 * `CartCompanyClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const CartCompanyClientCreateSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    companyId: z.ZodString;
    cartId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    clientId: string;
    cartId: string;
}, {
    companyId: string;
    clientId: string;
    cartId: string;
}>;
/**
 * `CartCompanyClient` schema for update operations excluding foreign keys and relations.
 */
export declare const CartCompanyClientUpdateScalarSchema: z.ZodObject<{
    cartId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    cartId?: string | undefined;
}, {
    cartId?: string | undefined;
}>;
/**
 * `CartCompanyClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const CartCompanyClientUpdateSchema: z.ZodObject<{} & {
    clientId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
    cartId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    clientId?: string | undefined;
    cartId?: string | undefined;
}, {
    companyId?: string | undefined;
    clientId?: string | undefined;
    cartId?: string | undefined;
}>;
