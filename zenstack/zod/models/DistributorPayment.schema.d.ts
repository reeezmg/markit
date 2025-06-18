import { z } from 'zod';
/**
 * `DistributorPayment` schema excluding foreign keys and relations.
 */
export declare const DistributorPaymentScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    amount: number;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}, {
    id: string;
    amount: number;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}>;
/**
 * `DistributorPayment` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const DistributorPaymentSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
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
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}, {
    distributorId: string;
    companyId: string;
    id: string;
    amount: number;
    distributorCompany?: Record<string, unknown> | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const DistributorPaymentPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const DistributorPaymentPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `DistributorPayment` schema for create operations excluding foreign keys and relations.
 */
export declare const DistributorPaymentCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}, {
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}>;
/**
 * `DistributorPayment` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorPaymentCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
    amount: z.ZodNumber;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    distributorId: z.ZodString;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    distributorId: string;
    companyId: string;
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}, {
    distributorId: string;
    companyId: string;
    amount: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    remarks?: string | null | undefined;
}>;
/**
 * `DistributorPayment` schema for update operations excluding foreign keys and relations.
 */
export declare const DistributorPaymentUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
}>;
/**
 * `DistributorPayment` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorPaymentUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    amount: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
} & {
    distributorId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    distributorId?: string | undefined;
    companyId?: string | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
}, {
    distributorId?: string | undefined;
    companyId?: string | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    amount?: number | undefined;
    remarks?: string | null | undefined;
}>;
