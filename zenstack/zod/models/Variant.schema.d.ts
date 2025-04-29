import { z } from 'zod';
/**
 * `Variant` schema excluding foreign keys and relations.
 */
export declare const VariantScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    sprice: z.ZodNumber;
    pprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sizes: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    images: z.ZodArray<z.ZodString, "many">;
    tax: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    images: string[];
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
    sprice: number;
    tax: number;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
}, {
    id: string;
    name: string;
    images: string[];
    updatedAt: Date;
    sprice: number;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
}>;
/**
 * `Variant` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const VariantSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodString;
    code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    sprice: z.ZodNumber;
    pprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sizes: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    images: z.ZodArray<z.ZodString, "many">;
    tax: z.ZodDefault<z.ZodNumber>;
} & {
    productId: z.ZodString;
    companyId: z.ZodString;
} & {
    product: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    items: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    entries: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    VariantSizeBarcode: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    images: string[];
    status: boolean;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
    sprice: number;
    tax: number;
    productId: string;
    company?: Record<string, unknown> | undefined;
    items?: unknown[] | undefined;
    entries?: unknown[] | undefined;
    product?: Record<string, unknown> | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    VariantSizeBarcode?: unknown[] | undefined;
}, {
    id: string;
    name: string;
    images: string[];
    companyId: string;
    updatedAt: Date;
    sprice: number;
    productId: string;
    company?: Record<string, unknown> | undefined;
    items?: unknown[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    entries?: unknown[] | undefined;
    product?: Record<string, unknown> | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
    VariantSizeBarcode?: unknown[] | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const VariantPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodNumber>;
    pprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodNumber>;
    pprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodNumber>;
    pprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const VariantPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    pprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    dprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    pprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    dprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    pprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    qty: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    dprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Variant` schema for create operations excluding foreign keys and relations.
 */
export declare const VariantCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sprice: z.ZodNumber;
    pprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sizes: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    sprice: number;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
}, {
    name: string;
    sprice: number;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
}>;
/**
 * `Variant` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const VariantCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sprice: z.ZodNumber;
    pprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    qty: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sizes: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
} & {
    productId: z.ZodString;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    companyId: string;
    sprice: number;
    productId: string;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
}, {
    name: string;
    companyId: string;
    sprice: number;
    productId: string;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
}>;
/**
 * `Variant` schema for update operations excluding foreign keys and relations.
 */
export declare const VariantUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodNumber>;
    pprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
}>;
/**
 * `Variant` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const VariantUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodNumber>;
    pprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    qty: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    sizes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
} & {
    productId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
    productId?: string | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    qty?: number | null | undefined;
    discount?: number | null | undefined;
    dprice?: number | null | undefined;
    sizes?: any;
    tax?: number | undefined;
    productId?: string | undefined;
}>;
