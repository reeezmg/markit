import { z } from 'zod';
/**
 * `TokenEntry` schema excluding foreign keys and relations.
 */
export declare const TokenEntryScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    tokenNo: z.ZodString;
    itemId: z.ZodString;
    variantId: z.ZodString;
    barcode: z.ZodString;
    categoryId: z.ZodString;
    size: z.ZodString;
    name: z.ZodString;
    qty: z.ZodNumber;
    rate: z.ZodNumber;
    discount: z.ZodNumber;
    tax: z.ZodNumber;
    value: z.ZodNumber;
    sizes: z.ZodAny;
    totalQty: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    sizes?: any;
}, {
    id: string;
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    sizes?: any;
}>;
/**
 * `TokenEntry` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const TokenEntrySchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    tokenNo: z.ZodString;
    itemId: z.ZodString;
    variantId: z.ZodString;
    barcode: z.ZodString;
    categoryId: z.ZodString;
    size: z.ZodString;
    name: z.ZodString;
    qty: z.ZodNumber;
    rate: z.ZodNumber;
    discount: z.ZodNumber;
    tax: z.ZodNumber;
    value: z.ZodNumber;
    sizes: z.ZodAny;
    totalQty: z.ZodNumber;
} & {
    companyId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    company?: Record<string, unknown> | undefined;
    sizes?: any;
}, {
    companyId: string;
    id: string;
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    company?: Record<string, unknown> | undefined;
    sizes?: any;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const TokenEntryPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodNumber>;
    rate: z.ZodOptional<z.ZodNumber>;
    discount: z.ZodOptional<z.ZodNumber>;
    tax: z.ZodOptional<z.ZodNumber>;
    value: z.ZodOptional<z.ZodNumber>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodNumber>;
    rate: z.ZodOptional<z.ZodNumber>;
    discount: z.ZodOptional<z.ZodNumber>;
    tax: z.ZodOptional<z.ZodNumber>;
    value: z.ZodOptional<z.ZodNumber>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodNumber>;
    rate: z.ZodOptional<z.ZodNumber>;
    discount: z.ZodOptional<z.ZodNumber>;
    tax: z.ZodOptional<z.ZodNumber>;
    value: z.ZodOptional<z.ZodNumber>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const TokenEntryPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    rate: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    rate: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    rate: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    value: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `TokenEntry` schema for create operations excluding foreign keys and relations.
 */
export declare const TokenEntryCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    discount: z.ZodNumber;
    qty: z.ZodNumber;
    sizes: z.ZodAny;
    createdAt: z.ZodDate;
    categoryId: z.ZodString;
    tax: z.ZodNumber;
    barcode: z.ZodString;
    variantId: z.ZodString;
    size: z.ZodString;
    rate: z.ZodNumber;
    value: z.ZodNumber;
    itemId: z.ZodString;
    tokenNo: z.ZodString;
    totalQty: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    id?: string | undefined;
    sizes?: any;
}, {
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    id?: string | undefined;
    sizes?: any;
}>;
/**
 * `TokenEntry` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const TokenEntryCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    discount: z.ZodNumber;
    qty: z.ZodNumber;
    sizes: z.ZodAny;
    createdAt: z.ZodDate;
    categoryId: z.ZodString;
    tax: z.ZodNumber;
    barcode: z.ZodString;
    variantId: z.ZodString;
    size: z.ZodString;
    rate: z.ZodNumber;
    value: z.ZodNumber;
    itemId: z.ZodString;
    tokenNo: z.ZodString;
    totalQty: z.ZodNumber;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    id?: string | undefined;
    sizes?: any;
}, {
    companyId: string;
    name: string;
    discount: number;
    qty: number;
    createdAt: Date;
    categoryId: string;
    tax: number;
    barcode: string;
    variantId: string;
    size: string;
    rate: number;
    value: number;
    itemId: string;
    tokenNo: string;
    totalQty: number;
    id?: string | undefined;
    sizes?: any;
}>;
/**
 * `TokenEntry` schema for update operations excluding foreign keys and relations.
 */
export declare const TokenEntryUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodNumber>;
    rate: z.ZodOptional<z.ZodNumber>;
    discount: z.ZodOptional<z.ZodNumber>;
    tax: z.ZodOptional<z.ZodNumber>;
    value: z.ZodOptional<z.ZodNumber>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    discount?: number | undefined;
    qty?: number | undefined;
    sizes?: any;
    createdAt?: Date | undefined;
    categoryId?: string | undefined;
    tax?: number | undefined;
    barcode?: string | undefined;
    variantId?: string | undefined;
    size?: string | undefined;
    rate?: number | undefined;
    value?: number | undefined;
    itemId?: string | undefined;
    tokenNo?: string | undefined;
    totalQty?: number | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    discount?: number | undefined;
    qty?: number | undefined;
    sizes?: any;
    createdAt?: Date | undefined;
    categoryId?: string | undefined;
    tax?: number | undefined;
    barcode?: string | undefined;
    variantId?: string | undefined;
    size?: string | undefined;
    rate?: number | undefined;
    value?: number | undefined;
    itemId?: string | undefined;
    tokenNo?: string | undefined;
    totalQty?: number | undefined;
}>;
/**
 * `TokenEntry` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const TokenEntryUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    tokenNo: z.ZodOptional<z.ZodString>;
    itemId: z.ZodOptional<z.ZodString>;
    variantId: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    qty: z.ZodOptional<z.ZodNumber>;
    rate: z.ZodOptional<z.ZodNumber>;
    discount: z.ZodOptional<z.ZodNumber>;
    tax: z.ZodOptional<z.ZodNumber>;
    value: z.ZodOptional<z.ZodNumber>;
    sizes: z.ZodOptional<z.ZodAny>;
    totalQty: z.ZodOptional<z.ZodNumber>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: string | undefined;
    discount?: number | undefined;
    qty?: number | undefined;
    sizes?: any;
    createdAt?: Date | undefined;
    categoryId?: string | undefined;
    tax?: number | undefined;
    barcode?: string | undefined;
    variantId?: string | undefined;
    size?: string | undefined;
    rate?: number | undefined;
    value?: number | undefined;
    itemId?: string | undefined;
    tokenNo?: string | undefined;
    totalQty?: number | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: string | undefined;
    discount?: number | undefined;
    qty?: number | undefined;
    sizes?: any;
    createdAt?: Date | undefined;
    categoryId?: string | undefined;
    tax?: number | undefined;
    barcode?: string | undefined;
    variantId?: string | undefined;
    size?: string | undefined;
    rate?: number | undefined;
    value?: number | undefined;
    itemId?: string | undefined;
    tokenNo?: string | undefined;
    totalQty?: number | undefined;
}>;
