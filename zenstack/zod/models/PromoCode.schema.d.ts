import { z } from 'zod';
/**
 * `PromoCode` schema excluding foreign keys and relations.
 */
export declare const PromoCodeScalarSchema: z.ZodObject<{
    id: z.ZodString;
    code: z.ZodString;
    discountPercent: z.ZodNumber;
    minAmount: z.ZodNumber;
    expiresAt: z.ZodDate;
    isActive: z.ZodDefault<z.ZodBoolean>;
    usageLimit: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    usageCount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    isActive: boolean;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}, {
    id: string;
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}>;
/**
 * `PromoCode` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const PromoCodeSchema: z.ZodObject<{
    id: z.ZodString;
    code: z.ZodString;
    discountPercent: z.ZodNumber;
    minAmount: z.ZodNumber;
    expiresAt: z.ZodDate;
    isActive: z.ZodDefault<z.ZodBoolean>;
    usageLimit: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    usageCount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    companyId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    clientsUsed: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    isActive: boolean;
    company?: Record<string, unknown> | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
    clientsUsed?: unknown[] | undefined;
}, {
    companyId: string;
    id: string;
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    company?: Record<string, unknown> | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
    clientsUsed?: unknown[] | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const PromoCodePrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodNumber>;
    minAmount: z.ZodOptional<z.ZodNumber>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    usageCount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodNumber>;
    minAmount: z.ZodOptional<z.ZodNumber>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    usageCount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodNumber>;
    minAmount: z.ZodOptional<z.ZodNumber>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    usageCount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const PromoCodePrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    minAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    usageCount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    minAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    usageCount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    minAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    usageCount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `PromoCode` schema for create operations excluding foreign keys and relations.
 */
export declare const PromoCodeCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodString;
    expiresAt: z.ZodDate;
    discountPercent: z.ZodNumber;
    minAmount: z.ZodNumber;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    usageCount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    id?: string | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}, {
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    id?: string | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}>;
/**
 * `PromoCode` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const PromoCodeCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodString;
    expiresAt: z.ZodDate;
    discountPercent: z.ZodNumber;
    minAmount: z.ZodNumber;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    usageCount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    id?: string | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}, {
    companyId: string;
    code: string;
    expiresAt: Date;
    discountPercent: number;
    minAmount: number;
    id?: string | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}>;
/**
 * `PromoCode` schema for update operations excluding foreign keys and relations.
 */
export declare const PromoCodeUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodNumber>;
    minAmount: z.ZodOptional<z.ZodNumber>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    usageCount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    code?: string | undefined;
    expiresAt?: Date | undefined;
    discountPercent?: number | undefined;
    minAmount?: number | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}, {
    id?: string | undefined;
    code?: string | undefined;
    expiresAt?: Date | undefined;
    discountPercent?: number | undefined;
    minAmount?: number | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}>;
/**
 * `PromoCode` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const PromoCodeUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    discountPercent: z.ZodOptional<z.ZodNumber>;
    minAmount: z.ZodOptional<z.ZodNumber>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    usageLimit: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    usageCount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    code?: string | undefined;
    expiresAt?: Date | undefined;
    discountPercent?: number | undefined;
    minAmount?: number | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    code?: string | undefined;
    expiresAt?: Date | undefined;
    discountPercent?: number | undefined;
    minAmount?: number | undefined;
    isActive?: boolean | undefined;
    usageLimit?: number | null | undefined;
    usageCount?: number | null | undefined;
}>;
