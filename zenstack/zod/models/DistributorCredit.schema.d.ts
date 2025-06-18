import { z } from 'zod';
/**
 * `DistributorCredit` schema excluding foreign keys and relations.
 */
export declare const DistributorCreditScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    amount: number;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}, {
    id: string;
    amount: number;
    createdAt?: Date | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}>;
/**
 * `DistributorCredit` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const DistributorCreditSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    distributorId: z.ZodString;
    companyId: z.ZodString;
} & {
    distributorCompany: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    distributorId: string;
    companyId: string;
    id: string;
    createdAt: Date;
    amount: number;
    distributorCompany?: Record<string, unknown> | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}, {
    distributorId: string;
    companyId: string;
    id: string;
    amount: number;
    distributorCompany?: Record<string, unknown> | undefined;
    createdAt?: Date | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const DistributorCreditPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const DistributorCreditPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `DistributorCredit` schema for create operations excluding foreign keys and relations.
 */
export declare const DistributorCreditCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}, {
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}>;
/**
 * `DistributorCredit` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorCreditCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    distributorId: z.ZodString;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    distributorId: string;
    companyId: string;
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}, {
    distributorId: string;
    companyId: string;
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}>;
/**
 * `DistributorCredit` schema for update operations excluding foreign keys and relations.
 */
export declare const DistributorCreditUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}>;
/**
 * `DistributorCredit` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorCreditUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    billNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
} & {
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    distributorId?: string | undefined;
    companyId?: string | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}, {
    distributorId?: string | undefined;
    companyId?: string | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
    billNo?: string | null | undefined;
}>;
