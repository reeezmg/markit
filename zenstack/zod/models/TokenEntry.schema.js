"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenEntryUpdateSchema = exports.TokenEntryUpdateScalarSchema = exports.TokenEntryCreateSchema = exports.TokenEntryCreateScalarSchema = exports.TokenEntryPrismaUpdateSchema = exports.TokenEntryPrismaCreateSchema = exports.TokenEntrySchema = exports.TokenEntryScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date(),
    tokenNo: zod_1.z.string(),
    itemId: zod_1.z.string(),
    variantId: zod_1.z.string(),
    barcode: zod_1.z.string(),
    categoryId: zod_1.z.string(),
    size: zod_1.z.string(),
    name: zod_1.z.string(),
    qty: zod_1.z.number(),
    rate: zod_1.z.number(),
    discount: zod_1.z.number(),
    tax: zod_1.z.number(),
    value: zod_1.z.number(),
    sizes: zod_1.z.any(),
    totalQty: zod_1.z.number(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `TokenEntry` schema excluding foreign keys and relations.
 */
exports.TokenEntryScalarSchema = baseSchema;
/**
 * `TokenEntry` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.TokenEntrySchema = exports.TokenEntryScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.TokenEntryPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.TokenEntryPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date(),
    tokenNo: zod_1.z.string(),
    itemId: zod_1.z.string(),
    variantId: zod_1.z.string(),
    barcode: zod_1.z.string(),
    categoryId: zod_1.z.string(),
    size: zod_1.z.string(),
    name: zod_1.z.string(),
    qty: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    rate: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    discount: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    tax: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    value: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    sizes: zod_1.z.any(),
    totalQty: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())])
}).partial().passthrough();
/**
 * `TokenEntry` schema for create operations excluding foreign keys and relations.
 */
exports.TokenEntryCreateScalarSchema = baseSchema.partial({
    id: true
});
/**
 * `TokenEntry` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.TokenEntryCreateSchema = exports.TokenEntryCreateScalarSchema.merge(fkSchema);
/**
 * `TokenEntry` schema for update operations excluding foreign keys and relations.
 */
exports.TokenEntryUpdateScalarSchema = baseSchema.partial();
/**
 * `TokenEntry` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.TokenEntryUpdateSchema = exports.TokenEntryUpdateScalarSchema.merge(fkSchema.partial());
