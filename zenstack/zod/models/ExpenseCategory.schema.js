"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseCategoryUpdateSchema = exports.ExpenseCategoryUpdateScalarSchema = exports.ExpenseCategoryCreateSchema = exports.ExpenseCategoryCreateScalarSchema = exports.ExpenseCategoryPrismaUpdateSchema = exports.ExpenseCategoryPrismaCreateSchema = exports.ExpenseCategorySchema = exports.ExpenseCategoryScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(256),
    status: zod_1.z.boolean().default(true),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
}).strict();
const relationSchema = zod_1.z.object({
    expenses: zod_1.z.array(zod_1.z.unknown()).optional(),
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `ExpenseCategory` schema excluding foreign keys and relations.
 */
exports.ExpenseCategoryScalarSchema = baseSchema;
/**
 * `ExpenseCategory` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ExpenseCategorySchema = exports.ExpenseCategoryScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ExpenseCategoryPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ExpenseCategoryPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string().min(1).max(256),
    status: zod_1.z.boolean().default(true),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `ExpenseCategory` schema for create operations excluding foreign keys and relations.
 */
exports.ExpenseCategoryCreateScalarSchema = baseSchema.partial({
    id: true, status: true, createdAt: true, updatedAt: true
});
/**
 * `ExpenseCategory` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ExpenseCategoryCreateSchema = exports.ExpenseCategoryCreateScalarSchema.merge(fkSchema);
/**
 * `ExpenseCategory` schema for update operations excluding foreign keys and relations.
 */
exports.ExpenseCategoryUpdateScalarSchema = baseSchema.partial();
/**
 * `ExpenseCategory` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ExpenseCategoryUpdateSchema = exports.ExpenseCategoryUpdateScalarSchema.merge(fkSchema.partial());
