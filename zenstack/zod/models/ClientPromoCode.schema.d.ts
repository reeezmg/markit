import { z } from 'zod';
/**
 * `ClientPromoCode` schema excluding foreign keys and relations.
 */
export declare const ClientPromoCodeScalarSchema: z.ZodObject<{
    id: z.ZodString;
    usedAt: z.ZodDefault<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id: string;
    usedAt: Date;
}, {
    id: string;
    usedAt?: Date | undefined;
}>;
/**
 * `ClientPromoCode` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ClientPromoCodeSchema: z.ZodObject<{
    id: z.ZodString;
    usedAt: z.ZodDefault<z.ZodDate>;
} & {
    clientId: z.ZodString;
    promoCodeId: z.ZodString;
} & {
    client: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    promoCode: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    clientId: string;
    promoCodeId: string;
    usedAt: Date;
    client?: Record<string, unknown> | undefined;
    promoCode?: Record<string, unknown> | undefined;
}, {
    id: string;
    clientId: string;
    promoCodeId: string;
    client?: Record<string, unknown> | undefined;
    promoCode?: Record<string, unknown> | undefined;
    usedAt?: Date | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ClientPromoCodePrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ClientPromoCodePrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `ClientPromoCode` schema for create operations excluding foreign keys and relations.
 */
export declare const ClientPromoCodeCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    usedAt?: Date | undefined;
}, {
    id?: string | undefined;
    usedAt?: Date | undefined;
}>;
/**
 * `ClientPromoCode` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ClientPromoCodeCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
} & {
    clientId: z.ZodString;
    promoCodeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    promoCodeId: string;
    id?: string | undefined;
    usedAt?: Date | undefined;
}, {
    clientId: string;
    promoCodeId: string;
    id?: string | undefined;
    usedAt?: Date | undefined;
}>;
/**
 * `ClientPromoCode` schema for update operations excluding foreign keys and relations.
 */
export declare const ClientPromoCodeUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    usedAt?: Date | undefined;
}, {
    id?: string | undefined;
    usedAt?: Date | undefined;
}>;
/**
 * `ClientPromoCode` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ClientPromoCodeUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    usedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
} & {
    clientId: z.ZodOptional<z.ZodString>;
    promoCodeId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    clientId?: string | undefined;
    promoCodeId?: string | undefined;
    usedAt?: Date | undefined;
}, {
    id?: string | undefined;
    clientId?: string | undefined;
    promoCodeId?: string | undefined;
    usedAt?: Date | undefined;
}>;
