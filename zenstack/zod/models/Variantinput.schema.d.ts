import { z } from 'zod';
/**
 * `Variantinput` schema excluding foreign keys and relations.
 */
export declare const VariantinputScalarSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodDefault<z.ZodBoolean>;
    code: z.ZodDefault<z.ZodBoolean>;
    sprice: z.ZodDefault<z.ZodBoolean>;
    pprice: z.ZodDefault<z.ZodBoolean>;
    dprice: z.ZodDefault<z.ZodBoolean>;
    discount: z.ZodDefault<z.ZodBoolean>;
    qty: z.ZodDefault<z.ZodBoolean>;
    sizes: z.ZodDefault<z.ZodBoolean>;
    images: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: boolean;
    images: boolean;
    code: boolean;
    sprice: boolean;
    pprice: boolean;
    dprice: boolean;
    discount: boolean;
    qty: boolean;
    sizes: boolean;
}, {
    id: string;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}>;
/**
 * `Variantinput` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const VariantinputSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodDefault<z.ZodBoolean>;
    code: z.ZodDefault<z.ZodBoolean>;
    sprice: z.ZodDefault<z.ZodBoolean>;
    pprice: z.ZodDefault<z.ZodBoolean>;
    dprice: z.ZodDefault<z.ZodBoolean>;
    discount: z.ZodDefault<z.ZodBoolean>;
    qty: z.ZodDefault<z.ZodBoolean>;
    sizes: z.ZodDefault<z.ZodBoolean>;
    images: z.ZodDefault<z.ZodBoolean>;
} & {
    companyId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    name: boolean;
    images: boolean;
    code: boolean;
    sprice: boolean;
    pprice: boolean;
    dprice: boolean;
    discount: boolean;
    qty: boolean;
    sizes: boolean;
    company?: Record<string, unknown> | undefined;
}, {
    companyId: string;
    id: string;
    company?: Record<string, unknown> | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const VariantinputPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const VariantinputPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Variantinput` schema for create operations excluding foreign keys and relations.
 */
export declare const VariantinputCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}, {
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}>;
/**
 * `Variantinput` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const VariantinputCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}, {
    companyId: string;
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}>;
/**
 * `Variantinput` schema for update operations excluding foreign keys and relations.
 */
export declare const VariantinputUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}, {
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}>;
/**
 * `Variantinput` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const VariantinputUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    dprice: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    discount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    qty: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sizes: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: boolean | undefined;
    images?: boolean | undefined;
    code?: boolean | undefined;
    sprice?: boolean | undefined;
    pprice?: boolean | undefined;
    dprice?: boolean | undefined;
    discount?: boolean | undefined;
    qty?: boolean | undefined;
    sizes?: boolean | undefined;
}>;
