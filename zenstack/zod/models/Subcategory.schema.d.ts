import { z } from 'zod';
/**
 * `Subcategory` schema excluding foreign keys and relations.
 */
export declare const SubcategoryScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
    image?: string | null | undefined;
}, {
    id: string;
    name: string;
    updatedAt: Date;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    image?: string | null | undefined;
}>;
/**
 * `Subcategory` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const SubcategorySchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companyId: z.ZodString;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    products: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    name: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
    company?: Record<string, unknown> | undefined;
    description?: string | null | undefined;
    products?: unknown[] | undefined;
    category?: Record<string, unknown> | undefined;
    image?: string | null | undefined;
    categoryId?: string | null | undefined;
}, {
    companyId: string;
    id: string;
    name: string;
    updatedAt: Date;
    company?: Record<string, unknown> | undefined;
    description?: string | null | undefined;
    products?: unknown[] | undefined;
    status?: boolean | undefined;
    category?: Record<string, unknown> | undefined;
    createdAt?: Date | undefined;
    image?: string | null | undefined;
    categoryId?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const SubcategoryPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const SubcategoryPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Subcategory` schema for create operations excluding foreign keys and relations.
 */
export declare const SubcategoryCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
}, {
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
}>;
/**
 * `Subcategory` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const SubcategoryCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companyId: z.ZodString;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
    categoryId?: string | null | undefined;
}, {
    companyId: string;
    name: string;
    id?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
    categoryId?: string | null | undefined;
}>;
/**
 * `Subcategory` schema for update operations excluding foreign keys and relations.
 */
export declare const SubcategoryUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
}>;
/**
 * `Subcategory` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const SubcategoryUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
    categoryId?: string | null | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    image?: string | null | undefined;
    categoryId?: string | null | undefined;
}>;
