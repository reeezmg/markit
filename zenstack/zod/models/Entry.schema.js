"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntryUpdateSchema = exports.EntryUpdateScalarSchema = exports.EntryCreateSchema = exports.EntryCreateScalarSchema = exports.EntryPrismaUpdateSchema = exports.EntryPrismaCreateSchema = exports.EntrySchema = exports.EntryScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string().nullish(),
    barcode: zod_1.z.string().nullish(),
    qty: zod_1.z.number().nullish(),
    rate: zod_1.z.number().nullish(),
    discount: zod_1.z.number().nullish(),
    tax: zod_1.z.number().nullish(),
    value: zod_1.z.number().nullish(),
    size: zod_1.z.string().nullish(),
    outOfStock: zod_1.z.boolean().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    variant: zod_1.z.record(zod_1.z.unknown()).optional(),
    category: zod_1.z.record(zod_1.z.unknown()).optional(),
    bill: zod_1.z.record(zod_1.z.unknown()).optional(),
    item: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    variantId: zod_1.z.string().nullish(),
    categoryId: zod_1.z.string().nullish(),
    billId: zod_1.z.string().nullish(),
    itemId: zod_1.z.string().nullish(),
});
/**
 * `Entry` schema excluding foreign keys and relations.
 */
exports.EntryScalarSchema = baseSchema;
/**
 * `Entry` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.EntrySchema = exports.EntryScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.EntryPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.EntryPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string().nullish(),
    barcode: zod_1.z.string().nullish(),
    qty: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    rate: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    discount: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    tax: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    value: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    size: zod_1.z.string().nullish(),
    outOfStock: zod_1.z.boolean().nullish()
}).partial().passthrough();
/**
 * `Entry` schema for create operations excluding foreign keys and relations.
 */
exports.EntryCreateScalarSchema = baseSchema.partial({
    id: true
});
/**
 * `Entry` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.EntryCreateSchema = exports.EntryCreateScalarSchema.merge(fkSchema);
/**
 * `Entry` schema for update operations excluding foreign keys and relations.
 */
exports.EntryUpdateScalarSchema = baseSchema.partial();
/**
 * `Entry` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.EntryUpdateSchema = exports.EntryUpdateScalarSchema.merge(fkSchema.partial());
