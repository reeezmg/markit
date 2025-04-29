"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemUpdateSchema = exports.ItemUpdateScalarSchema = exports.ItemCreateSchema = exports.ItemCreateScalarSchema = exports.ItemPrismaUpdateSchema = exports.ItemPrismaCreateSchema = exports.ItemSchema = exports.ItemScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    barcode: zod_1.z.string().nullish(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    status: zod_1.z.string().default("in_stock"),
    size: zod_1.z.string().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    variant: zod_1.z.record(zod_1.z.unknown()),
    entry: zod_1.z.record(zod_1.z.unknown()).optional(),
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    variantId: zod_1.z.string(),
    companyId: zod_1.z.string(),
});
/**
 * `Item` schema excluding foreign keys and relations.
 */
exports.ItemScalarSchema = baseSchema;
/**
 * `Item` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ItemSchema = exports.ItemScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ItemPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ItemPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    barcode: zod_1.z.string().nullish(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    status: zod_1.z.string().default("in_stock"),
    size: zod_1.z.string().nullish()
}).partial().passthrough();
/**
 * `Item` schema for create operations excluding foreign keys and relations.
 */
exports.ItemCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, status: true
});
/**
 * `Item` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ItemCreateSchema = exports.ItemCreateScalarSchema.merge(fkSchema);
/**
 * `Item` schema for update operations excluding foreign keys and relations.
 */
exports.ItemUpdateScalarSchema = baseSchema.partial();
/**
 * `Item` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ItemUpdateSchema = exports.ItemUpdateScalarSchema.merge(fkSchema.partial());
