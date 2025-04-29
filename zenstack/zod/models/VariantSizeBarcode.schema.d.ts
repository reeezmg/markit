import { z } from 'zod';
/**
 * `VariantSizeBarcode` schema excluding foreign keys and relations.
 */
export declare const VariantSizeBarcodeScalarSchema: z.ZodObject<{
    id: z.ZodNumber;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    barcode: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: number;
    barcode: string;
    size?: string | null | undefined;
}, {
    id: number;
    barcode: string;
    size?: string | null | undefined;
}>;
/**
 * `VariantSizeBarcode` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const VariantSizeBarcodeSchema: z.ZodObject<{
    id: z.ZodNumber;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    barcode: z.ZodString;
} & {
    variantId: z.ZodString;
} & {
    variant: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: number;
    barcode: string;
    variantId: string;
    variant?: Record<string, unknown> | undefined;
    size?: string | null | undefined;
}, {
    id: number;
    barcode: string;
    variantId: string;
    variant?: Record<string, unknown> | undefined;
    size?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const VariantSizeBarcodePrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const VariantSizeBarcodePrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `VariantSizeBarcode` schema for create operations excluding foreign keys and relations.
 */
export declare const VariantSizeBarcodeCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    barcode: z.ZodString;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    barcode: string;
    id?: number | undefined;
    size?: string | null | undefined;
}, {
    barcode: string;
    id?: number | undefined;
    size?: string | null | undefined;
}>;
/**
 * `VariantSizeBarcode` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const VariantSizeBarcodeCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    barcode: z.ZodString;
    size: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    variantId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    barcode: string;
    variantId: string;
    id?: number | undefined;
    size?: string | null | undefined;
}, {
    barcode: string;
    variantId: string;
    id?: number | undefined;
    size?: string | null | undefined;
}>;
/**
 * `VariantSizeBarcode` schema for update operations excluding foreign keys and relations.
 */
export declare const VariantSizeBarcodeUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id?: number | undefined;
    barcode?: string | undefined;
    size?: string | null | undefined;
}, {
    id?: number | undefined;
    barcode?: string | undefined;
    size?: string | null | undefined;
}>;
/**
 * `VariantSizeBarcode` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const VariantSizeBarcodeUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    barcode: z.ZodOptional<z.ZodString>;
} & {
    variantId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: number | undefined;
    barcode?: string | undefined;
    variantId?: string | undefined;
    size?: string | null | undefined;
}, {
    id?: number | undefined;
    barcode?: string | undefined;
    variantId?: string | undefined;
    size?: string | null | undefined;
}>;
