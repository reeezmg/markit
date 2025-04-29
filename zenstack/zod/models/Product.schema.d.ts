import { z } from 'zod';
/**
 * `Product` schema excluding foreign keys and relations.
 */
export declare const ProductScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    brand: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    rating: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
}, {
    id: string;
    name: string;
    updatedAt: Date;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
}>;
/**
 * `Product` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ProductSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    brand: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    rating: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companyId: z.ZodString;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    subcategoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    purchaseorderId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    subcategory: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    variants: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    purchaseorder: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
    purchaseorderId: string;
    description?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    variants?: unknown[] | undefined;
    category?: Record<string, unknown> | undefined;
    subcategory?: Record<string, unknown> | undefined;
    categoryId?: string | null | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
    subcategoryId?: string | null | undefined;
    purchaseorder?: Record<string, unknown> | undefined;
}, {
    id: string;
    name: string;
    companyId: string;
    updatedAt: Date;
    purchaseorderId: string;
    description?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    variants?: unknown[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    category?: Record<string, unknown> | undefined;
    subcategory?: Record<string, unknown> | undefined;
    categoryId?: string | null | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
    subcategoryId?: string | null | undefined;
    purchaseorder?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ProductPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ProductPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Product` schema for create operations excluding foreign keys and relations.
 */
export declare const ProductCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    brand: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rating: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
}, {
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
}>;
/**
 * `Product` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ProductCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    brand: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rating: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    companyId: z.ZodString;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    subcategoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    purchaseorderId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    companyId: string;
    purchaseorderId: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    categoryId?: string | null | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
    subcategoryId?: string | null | undefined;
}, {
    name: string;
    companyId: string;
    purchaseorderId: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    categoryId?: string | null | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
    subcategoryId?: string | null | undefined;
}>;
/**
 * `Product` schema for update operations excluding foreign keys and relations.
 */
export declare const ProductUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
}>;
/**
 * `Product` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ProductUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rating: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    subcategoryId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    purchaseorderId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    categoryId?: string | null | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
    subcategoryId?: string | null | undefined;
    purchaseorderId?: string | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    categoryId?: string | null | undefined;
    brand?: string | null | undefined;
    rating?: number | null | undefined;
    subcategoryId?: string | null | undefined;
    purchaseorderId?: string | undefined;
}>;
