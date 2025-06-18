import { z } from 'zod';
/**
 * `Productinput` schema excluding foreign keys and relations.
 */
export declare const ProductinputScalarSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodDefault<z.ZodBoolean>;
    brand: z.ZodDefault<z.ZodBoolean>;
    category: z.ZodDefault<z.ZodBoolean>;
    subcategory: z.ZodDefault<z.ZodBoolean>;
    description: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: boolean;
    description: boolean;
    brand: boolean;
    category: boolean;
    subcategory: boolean;
}, {
    id: string;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}>;
/**
 * `Productinput` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ProductinputSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodDefault<z.ZodBoolean>;
    brand: z.ZodDefault<z.ZodBoolean>;
    category: z.ZodDefault<z.ZodBoolean>;
    subcategory: z.ZodDefault<z.ZodBoolean>;
    description: z.ZodDefault<z.ZodBoolean>;
} & {
    companyId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    name: boolean;
    description: boolean;
    brand: boolean;
    category: boolean;
    subcategory: boolean;
    company?: Record<string, unknown> | undefined;
}, {
    companyId: string;
    id: string;
    company?: Record<string, unknown> | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ProductinputPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ProductinputPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Productinput` schema for create operations excluding foreign keys and relations.
 */
export declare const ProductinputCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}, {
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}>;
/**
 * `Productinput` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ProductinputCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}, {
    companyId: string;
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}>;
/**
 * `Productinput` schema for update operations excluding foreign keys and relations.
 */
export declare const ProductinputUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}, {
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}>;
/**
 * `Productinput` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ProductinputUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    brand: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    subcategory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: boolean | undefined;
    description?: boolean | undefined;
    brand?: boolean | undefined;
    category?: boolean | undefined;
    subcategory?: boolean | undefined;
}>;
