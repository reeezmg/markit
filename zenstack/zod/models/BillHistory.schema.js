"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillHistoryUpdateSchema = exports.BillHistoryUpdateScalarSchema = exports.BillHistoryCreateSchema = exports.BillHistoryCreateScalarSchema = exports.BillHistoryPrismaUpdateSchema = exports.BillHistoryPrismaCreateSchema = exports.BillHistorySchema = exports.BillHistoryScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    data: zod_1.z.any(),
    changedAt: zod_1.z.coerce.date().default(() => new Date()),
    operation: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    bill: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    billId: zod_1.z.string().nullish(),
});
/**
 * `BillHistory` schema excluding foreign keys and relations.
 */
exports.BillHistoryScalarSchema = baseSchema;
/**
 * `BillHistory` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.BillHistorySchema = exports.BillHistoryScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.BillHistoryPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.BillHistoryPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    data: zod_1.z.any(),
    changedAt: zod_1.z.coerce.date().default(() => new Date()),
    operation: zod_1.z.string()
}).partial().passthrough();
/**
 * `BillHistory` schema for create operations excluding foreign keys and relations.
 */
exports.BillHistoryCreateScalarSchema = baseSchema.partial({
    id: true, changedAt: true
});
/**
 * `BillHistory` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.BillHistoryCreateSchema = exports.BillHistoryCreateScalarSchema.merge(fkSchema);
/**
 * `BillHistory` schema for update operations excluding foreign keys and relations.
 */
exports.BillHistoryUpdateScalarSchema = baseSchema.partial();
/**
 * `BillHistory` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.BillHistoryUpdateSchema = exports.BillHistoryUpdateScalarSchema.merge(fkSchema.partial());
