import { z } from 'zod';
/**
 * `BillHistory` schema excluding foreign keys and relations.
 */
export declare const BillHistoryScalarSchema: z.ZodObject<{
    id: z.ZodString;
    data: z.ZodAny;
    changedAt: z.ZodDefault<z.ZodDate>;
    operation: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    changedAt: Date;
    operation: string;
    data?: any;
}, {
    id: string;
    operation: string;
    data?: any;
    changedAt?: Date | undefined;
}>;
/**
 * `BillHistory` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const BillHistorySchema: z.ZodObject<{
    id: z.ZodString;
    data: z.ZodAny;
    changedAt: z.ZodDefault<z.ZodDate>;
    operation: z.ZodString;
} & {
    billId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    bill: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    changedAt: Date;
    operation: string;
    bill?: Record<string, unknown> | undefined;
    billId?: string | null | undefined;
    data?: any;
}, {
    id: string;
    operation: string;
    bill?: Record<string, unknown> | undefined;
    billId?: string | null | undefined;
    data?: any;
    changedAt?: Date | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const BillHistoryPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const BillHistoryPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `BillHistory` schema for create operations excluding foreign keys and relations.
 */
export declare const BillHistoryCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodAny;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodString;
}, "strict", z.ZodTypeAny, {
    operation: string;
    id?: string | undefined;
    data?: any;
    changedAt?: Date | undefined;
}, {
    operation: string;
    id?: string | undefined;
    data?: any;
    changedAt?: Date | undefined;
}>;
/**
 * `BillHistory` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const BillHistoryCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodAny;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodString;
} & {
    billId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    operation: string;
    id?: string | undefined;
    billId?: string | null | undefined;
    data?: any;
    changedAt?: Date | undefined;
}, {
    operation: string;
    id?: string | undefined;
    billId?: string | null | undefined;
    data?: any;
    changedAt?: Date | undefined;
}>;
/**
 * `BillHistory` schema for update operations excluding foreign keys and relations.
 */
export declare const BillHistoryUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    data?: any;
    changedAt?: Date | undefined;
    operation?: string | undefined;
}, {
    id?: string | undefined;
    data?: any;
    changedAt?: Date | undefined;
    operation?: string | undefined;
}>;
/**
 * `BillHistory` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const BillHistoryUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    changedAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    operation: z.ZodOptional<z.ZodString>;
} & {
    billId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    billId?: string | null | undefined;
    data?: any;
    changedAt?: Date | undefined;
    operation?: string | undefined;
}, {
    id?: string | undefined;
    billId?: string | null | undefined;
    data?: any;
    changedAt?: Date | undefined;
    operation?: string | undefined;
}>;
