import { z } from 'zod';
/**
 * `Expense` schema excluding foreign keys and relations.
 */
export declare const ExpenseScalarSchema: z.ZodObject<{
    id: z.ZodString;
    expenseDate: z.ZodDefault<z.ZodDate>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    currency: z.ZodDefault<z.ZodString>;
    paymentMode: z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>;
    status: z.ZodDefault<z.ZodString>;
    receipt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    receiptName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    totalAmount: z.ZodNumber;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    totalAmount: number;
    expenseDate: Date;
    currency: string;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    note?: string | null | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    totalAmount: number;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    status?: string | undefined;
    createdAt?: Date | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}>;
/**
 * `Expense` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ExpenseSchema: z.ZodObject<{
    id: z.ZodString;
    expenseDate: z.ZodDefault<z.ZodDate>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    currency: z.ZodDefault<z.ZodString>;
    paymentMode: z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>;
    status: z.ZodDefault<z.ZodString>;
    receipt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    receiptName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    totalAmount: z.ZodNumber;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
} & {
    expensecategoryId: z.ZodString;
    companyId: z.ZodString;
} & {
    expensecategory: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    totalAmount: number;
    expenseDate: Date;
    currency: string;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    expensecategoryId: string;
    company?: Record<string, unknown> | undefined;
    expensecategory?: Record<string, unknown> | undefined;
    note?: string | null | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}, {
    companyId: string;
    id: string;
    updatedAt: Date;
    totalAmount: number;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    expensecategoryId: string;
    company?: Record<string, unknown> | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    expensecategory?: Record<string, unknown> | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ExpensePrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    totalAmount: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    totalAmount: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    totalAmount: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ExpensePrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    totalAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    totalAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    totalAmount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Expense` schema for create operations excluding foreign keys and relations.
 */
export declare const ExpenseCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    totalAmount: z.ZodNumber;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>;
    receipt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    receiptName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    totalAmount: number;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}, {
    totalAmount: number;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}>;
/**
 * `Expense` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ExpenseCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    totalAmount: z.ZodNumber;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>;
    receipt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    receiptName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    taxAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    expensecategoryId: z.ZodString;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    totalAmount: number;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    expensecategoryId: string;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}, {
    companyId: string;
    totalAmount: number;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
    expensecategoryId: string;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}>;
/**
 * `Expense` schema for update operations excluding foreign keys and relations.
 */
export declare const ExpenseUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    totalAmount: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    totalAmount?: number | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}, {
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    totalAmount?: number | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
}>;
/**
 * `Expense` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ExpenseUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    expenseDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    note: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE"]>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    receipt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    receiptName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    taxAmount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    totalAmount: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    expensecategoryId: z.ZodOptional<z.ZodString>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId?: string | undefined;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    totalAmount?: number | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
    expensecategoryId?: string | undefined;
}, {
    companyId?: string | undefined;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    totalAmount?: number | undefined;
    expenseDate?: Date | undefined;
    note?: string | null | undefined;
    currency?: string | undefined;
    paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | undefined;
    receipt?: string | null | undefined;
    receiptName?: string | null | undefined;
    taxAmount?: number | null | undefined;
    expensecategoryId?: string | undefined;
}>;
