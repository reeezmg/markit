import { z } from 'zod';
/**
 * `Cart` schema excluding foreign keys and relations.
 */
export declare const CartScalarSchema: z.ZodObject<{
    id: z.ZodString;
    items: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    items?: any;
}, {
    id: string;
    updatedAt: Date;
    items?: any;
    createdAt?: Date | undefined;
}>;
/**
 * `Cart` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const CartSchema: z.ZodObject<{
    id: z.ZodString;
    items: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
} & {
    clientCompany: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    items?: any;
    clientCompany?: Record<string, unknown> | undefined;
}, {
    id: string;
    updatedAt: Date;
    items?: any;
    createdAt?: Date | undefined;
    clientCompany?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const CartPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const CartPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Cart` schema for create operations excluding foreign keys and relations.
 */
export declare const CartCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
/**
 * `Cart` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const CartCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
/**
 * `Cart` schema for update operations excluding foreign keys and relations.
 */
export declare const CartUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
/**
 * `Cart` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const CartUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    id?: string | undefined;
    items?: any;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
