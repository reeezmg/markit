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
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    images: z.ZodArray<z.ZodString, "many">;
    tax: z.ZodDefault<z.ZodNumber>;
    sold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    images: string[];
    status: boolean;
    sprice: number;
    createdAt: Date;
    updatedAt: Date;
    tax: number;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    sold?: number | null | undefined;
}, {
    id: string;
    name: string;
    images: string[];
    sprice: number;
    updatedAt: Date;
    status?: boolean | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    tax?: number | undefined;
    sold?: number | null | undefined;
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
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    images: z.ZodArray<z.ZodString, "many">;
    tax: z.ZodDefault<z.ZodNumber>;
    sold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
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
    companyId: string;
    id: string;
    name: string;
    images: string[];
    status: boolean;
    sprice: number;
    createdAt: Date;
    updatedAt: Date;
    tax: number;
    productId: string;
    company?: Record<string, unknown> | undefined;
    items?: unknown[] | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    entries?: unknown[] | undefined;
    product?: Record<string, unknown> | undefined;
    VariantSizeBarcode?: unknown[] | undefined;
    sold?: number | null | undefined;
}, {
    companyId: string;
    id: string;
    name: string;
    images: string[];
    sprice: number;
    updatedAt: Date;
    productId: string;
    company?: Record<string, unknown> | undefined;
    items?: unknown[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    entries?: unknown[] | undefined;
    product?: Record<string, unknown> | undefined;
    tax?: number | undefined;
    VariantSizeBarcode?: unknown[] | undefined;
    sold?: number | null | undefined;
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
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodNumber>;
    pprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodNumber>;
    pprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
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
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    dprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    pprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    dprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sprice: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    pprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    dprice: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    sold: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Variant` schema for create operations excluding foreign keys and relations.
 */
export declare const VariantCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sprice: z.ZodNumber;
    pprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    sprice: number;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    sold?: number | null | undefined;
}, {
    name: string;
    sprice: number;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    sold?: number | null | undefined;
}>;
/**
 * `Variant` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const VariantCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sprice: z.ZodNumber;
    pprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    dprice: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sold: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    productId: z.ZodString;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    name: string;
    sprice: number;
    productId: string;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    sold?: number | null | undefined;
}, {
    companyId: string;
    name: string;
    sprice: number;
    productId: string;
    id?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    sold?: number | null | undefined;
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
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    sold?: number | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    sold?: number | null | undefined;
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
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    dprice: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tax: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    sold: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
} & {
    productId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    productId?: string | undefined;
    sold?: number | null | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    name?: string | undefined;
    images?: string[] | undefined;
    status?: boolean | undefined;
    code?: string | null | undefined;
    sprice?: number | undefined;
    pprice?: number | null | undefined;
    dprice?: number | null | undefined;
    discount?: number | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tax?: number | undefined;
    productId?: string | undefined;
    sold?: number | null | undefined;
}>;
