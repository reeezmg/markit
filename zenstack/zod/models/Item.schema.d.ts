import { z } from 'zod';
/**
 * `Item` schema excluding foreign keys and relations.
 */
export declare const ItemScalarSchema: z.ZodObject<{
    id: z.ZodString;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    qty?: number | null | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}>;
/**
 * `Item` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ItemSchema: z.ZodObject<{
    id: z.ZodString;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>;
} & {
    variantId: z.ZodString;
    companyId: z.ZodString;
} & {
    variant: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    entry: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    variantId: string;
    company?: Record<string, unknown> | undefined;
    qty?: number | null | undefined;
    variant?: Record<string, unknown> | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    entry?: unknown[] | undefined;
}, {
    companyId: string;
    id: string;
    updatedAt: Date;
    variantId: string;
    company?: Record<string, unknown> | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    variant?: Record<string, unknown> | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    entry?: unknown[] | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ItemPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ItemPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Item` schema for create operations excluding foreign keys and relations.
 */
export declare const ItemCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}, {
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}>;
/**
 * `Item` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ItemCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    variantId: z.ZodString;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    variantId: string;
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}, {
    companyId: string;
    variantId: string;
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}>;
/**
 * `Item` schema for update operations excluding foreign keys and relations.
 */
export declare const ItemUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}, {
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
}>;
/**
 * `Item` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ItemUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>>;
} & {
    variantId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    variantId?: string | undefined;
    size?: string | null | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    qty?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    barcode?: string | null | undefined;
    variantId?: string | undefined;
    size?: string | null | undefined;
}>;
