import { z } from 'zod';
/**
 * `Category` schema excluding foreign keys and relations.
 */
export declare const CategoryScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    hsn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxType: z.ZodEnum<["FIXED", "VARIABLE"]>;
    fixedTax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    thresholdAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxBelowThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxAboveThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
    taxType: "FIXED" | "VARIABLE";
    description?: string | null | undefined;
    image?: string | null | undefined;
    hsn?: string | null | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}, {
    id: string;
    name: string;
    updatedAt: Date;
    taxType: "FIXED" | "VARIABLE";
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    hsn?: string | null | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}>;
/**
 * `Category` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const CategorySchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    hsn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxType: z.ZodEnum<["FIXED", "VARIABLE"]>;
    fixedTax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    thresholdAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxBelowThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxAboveThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    companyId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    products: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    subcategories: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    entries: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
    taxType: "FIXED" | "VARIABLE";
    description?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    products?: unknown[] | undefined;
    subcategories?: unknown[] | undefined;
    image?: string | null | undefined;
    entries?: unknown[] | undefined;
    hsn?: string | null | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}, {
    id: string;
    name: string;
    companyId: string;
    updatedAt: Date;
    taxType: "FIXED" | "VARIABLE";
    description?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    products?: unknown[] | undefined;
    subcategories?: unknown[] | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    entries?: unknown[] | undefined;
    hsn?: string | null | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const CategoryPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    thresholdAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxBelowThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxAboveThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    thresholdAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxBelowThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxAboveThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    thresholdAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxBelowThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxAboveThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const CategoryPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    thresholdAmount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    taxBelowThreshold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    taxAboveThreshold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    thresholdAmount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    taxBelowThreshold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    taxAboveThreshold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    thresholdAmount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    taxBelowThreshold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    taxAboveThreshold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Category` schema for create operations excluding foreign keys and relations.
 */
export declare const CategoryCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    hsn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    thresholdAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxBelowThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxAboveThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}, {
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}>;
/**
 * `Category` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const CategoryCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    hsn: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    thresholdAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxBelowThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    taxAboveThreshold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    companyId: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}, {
    name: string;
    companyId: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}>;
/**
 * `Category` schema for update operations excluding foreign keys and relations.
 */
export declare const CategoryUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    thresholdAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxBelowThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxAboveThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}>;
/**
 * `Category` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const CategoryUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    hsn: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxType: z.ZodOptional<z.ZodEnum<["FIXED", "VARIABLE"]>>;
    fixedTax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    thresholdAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxBelowThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    taxAboveThreshold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    hsn?: string | null | undefined;
    taxType?: "FIXED" | "VARIABLE" | undefined;
    fixedTax?: number | null | undefined;
    thresholdAmount?: number | null | undefined;
    taxBelowThreshold?: number | null | undefined;
    taxAboveThreshold?: number | null | undefined;
}>;
