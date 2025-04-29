import { z } from 'zod';
/**
 * `Entry` schema excluding foreign keys and relations.
 */
export declare const EntryScalarSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    value: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    outOfStock: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
}, {
    id: string;
    name?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
}>;
/**
 * `Entry` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const EntrySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    value: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    outOfStock: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
} & {
    variantId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    itemId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    variant: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    bill: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    item: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name?: string | null | undefined;
    bill?: Record<string, unknown> | undefined;
    category?: Record<string, unknown> | undefined;
    categoryId?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    variant?: Record<string, unknown> | undefined;
    barcode?: string | null | undefined;
    variantId?: string | null | undefined;
    size?: string | null | undefined;
    item?: Record<string, unknown> | undefined;
    itemId?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
    billId?: string | null | undefined;
}, {
    id: string;
    name?: string | null | undefined;
    bill?: Record<string, unknown> | undefined;
    category?: Record<string, unknown> | undefined;
    categoryId?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    variant?: Record<string, unknown> | undefined;
    barcode?: string | null | undefined;
    variantId?: string | null | undefined;
    size?: string | null | undefined;
    item?: Record<string, unknown> | undefined;
    itemId?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
    billId?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const EntryPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    rate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    value: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    rate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    value: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    rate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    value: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const EntryPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    rate: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    rate: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    rate: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Entry` schema for create operations excluding foreign keys and relations.
 */
export declare const EntryCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    value: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    outOfStock: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
}>;
/**
 * `Entry` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const EntryCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    barcode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    value: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    outOfStock: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
} & {
    variantId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    itemId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    categoryId?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    variantId?: string | null | undefined;
    size?: string | null | undefined;
    itemId?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
    billId?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    categoryId?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    variantId?: string | null | undefined;
    size?: string | null | undefined;
    itemId?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
    billId?: string | null | undefined;
}>;
/**
 * `Entry` schema for update operations excluding foreign keys and relations.
 */
export declare const EntryUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    rate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    value: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    size?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
}>;
/**
 * `Entry` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const EntryUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    rate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    value: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    outOfStock: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>;
} & {
    variantId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    categoryId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    itemId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    categoryId?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    variantId?: string | null | undefined;
    size?: string | null | undefined;
    itemId?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
    billId?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    categoryId?: string | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    barcode?: string | null | undefined;
    variantId?: string | null | undefined;
    size?: string | null | undefined;
    itemId?: string | null | undefined;
    rate?: number | null | undefined;
    value?: number | null | undefined;
    outOfStock?: boolean | null | undefined;
    billId?: string | null | undefined;
}>;
