"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseUpdateSchema = exports.ExpenseUpdateScalarSchema = exports.ExpenseCreateSchema = exports.ExpenseCreateScalarSchema = exports.ExpensePrismaUpdateSchema = exports.ExpensePrismaCreateSchema = exports.ExpenseSchema = exports.ExpenseScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const PaymentMode_schema_1 = require("../enums/PaymentMode.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    expenseDate: zod_1.z.coerce.date().default(() => new Date()),
    note: zod_1.z.string().min(1).max(512).nullish(),
    currency: zod_1.z.string().default("INR"),
    paymentMode: PaymentMode_schema_1.PaymentModeSchema,
    status: zod_1.z.string().default("Pending"),
    receipt: zod_1.z.string().nullish(),
    receiptName: zod_1.z.string().nullish(),
    taxAmount: zod_1.z.number().nullish(),
    totalAmount: zod_1.z.number(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
}).strict();
const relationSchema = zod_1.z.object({
    expensecategory: zod_1.z.record(zod_1.z.unknown()),
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    expensecategoryId: zod_1.z.string(),
    companyId: zod_1.z.string(),
});
/**
 * `Expense` schema excluding foreign keys and relations.
 */
exports.ExpenseScalarSchema = baseSchema;
/**
 * `Expense` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ExpenseSchema = exports.ExpenseScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ExpensePrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ExpensePrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    expenseDate: zod_1.z.coerce.date().default(() => new Date()),
    note: zod_1.z.string().min(1).max(512).nullish(),
    currency: zod_1.z.string().default("INR"),
    paymentMode: PaymentMode_schema_1.PaymentModeSchema,
    status: zod_1.z.string().default("Pending"),
    receipt: zod_1.z.string().nullish(),
    receiptName: zod_1.z.string().nullish(),
    taxAmount: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    totalAmount: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `Expense` schema for create operations excluding foreign keys and relations.
 */
exports.ExpenseCreateScalarSchema = baseSchema.partial({
    id: true, expenseDate: true, currency: true, status: true, createdAt: true, updatedAt: true
});
/**
 * `Expense` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ExpenseCreateSchema = exports.ExpenseCreateScalarSchema.merge(fkSchema);
/**
 * `Expense` schema for update operations excluding foreign keys and relations.
 */
exports.ExpenseUpdateScalarSchema = baseSchema.partial();
/**
 * `Expense` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ExpenseUpdateSchema = exports.ExpenseUpdateScalarSchema.merge(fkSchema.partial());
