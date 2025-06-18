import { z } from 'zod';
/**
 * `PurchaseOrder` schema excluding foreign keys and relations.
 */
export declare const PurchaseOrderScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
    totalAmount: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    totalAmount: number;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}>;
/**
 * `PurchaseOrder` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const PurchaseOrderSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
    totalAmount: z.ZodDefault<z.ZodNumber>;
} & {
    companyId: z.ZodString;
    distributorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    products: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    distributorCompany: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    totalAmount: number;
    distributorId?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    distributorCompany?: Record<string, unknown> | undefined;
    products?: unknown[] | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
}, {
    companyId: string;
    id: string;
    updatedAt: Date;
    distributorId?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    distributorCompany?: Record<string, unknown> | undefined;
    products?: unknown[] | undefined;
    createdAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const PurchaseOrderPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const PurchaseOrderPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodUnion<[z.ZodDefault<z.ZodNumber>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `PurchaseOrder` schema for create operations excluding foreign keys and relations.
 */
export declare const PurchaseOrderCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
    totalAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}>;
/**
 * `PurchaseOrder` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const PurchaseOrderCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>;
    totalAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
} & {
    companyId: z.ZodString;
    distributorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    distributorId?: string | null | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}, {
    companyId: string;
    distributorId?: string | null | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}>;
/**
 * `PurchaseOrder` schema for update operations excluding foreign keys and relations.
 */
export declare const PurchaseOrderUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}>;
/**
 * `PurchaseOrder` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const PurchaseOrderUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["CREDIT", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]>>>>;
    totalAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
    distributorId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    distributorId?: string | null | undefined;
    companyId?: string | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}, {
    distributorId?: string | null | undefined;
    companyId?: string | undefined;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "CREDIT" | "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | null | undefined;
    totalAmount?: number | undefined;
}>;
