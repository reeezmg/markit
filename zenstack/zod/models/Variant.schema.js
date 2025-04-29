"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VariantUpdateSchema = exports.VariantUpdateScalarSchema = exports.VariantCreateSchema = exports.VariantCreateScalarSchema = exports.VariantPrismaUpdateSchema = exports.VariantPrismaCreateSchema = exports.VariantSchema = exports.VariantScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().min(1).max(256),
    code: zod_1.z.string().min(1).max(256).nullish(),
    status: zod_1.z.boolean().default(true),
    sprice: zod_1.z.number(),
    pprice: zod_1.z.number().nullish(),
    qty: zod_1.z.number().nullish(),
    discount: zod_1.z.number().nullish(),
    dprice: zod_1.z.number().nullish(),
    sizes: zod_1.z.any().nullish(),
    images: zod_1.z.array(zod_1.z.string()),
    tax: zod_1.z.number().default(0.0),
}).strict();
const relationSchema = zod_1.z.object({
    product: zod_1.z.record(zod_1.z.unknown()),
    items: zod_1.z.array(zod_1.z.unknown()).optional(),
    entries: zod_1.z.array(zod_1.z.unknown()).optional(),
    company: zod_1.z.record(zod_1.z.unknown()),
    VariantSizeBarcode: zod_1.z.array(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    productId: zod_1.z.string(),
    companyId: zod_1.z.string(),
});
/**
 * `Variant` schema excluding foreign keys and relations.
 */
exports.VariantScalarSchema = baseSchema;
/**
 * `Variant` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.VariantSchema = exports.VariantScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.VariantPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.VariantPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().min(1).max(256),
    code: zod_1.z.string().min(1).max(256).nullish(),
    status: zod_1.z.boolean().default(true),
    sprice: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    pprice: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    qty: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    discount: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    dprice: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    sizes: zod_1.z.any().nullish(),
    images: zod_1.z.array(zod_1.z.string()),
    tax: zod_1.z.union([zod_1.z.number().default(0.0), zod_1.z.record(zod_1.z.unknown())])
}).partial().passthrough();
/**
 * `Variant` schema for create operations excluding foreign keys and relations.
 */
exports.VariantCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, status: true, images: true, tax: true
});
/**
 * `Variant` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.VariantCreateSchema = exports.VariantCreateScalarSchema.merge(fkSchema);
/**
 * `Variant` schema for update operations excluding foreign keys and relations.
 */
exports.VariantUpdateScalarSchema = baseSchema.partial();
/**
 * `Variant` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.VariantUpdateSchema = exports.VariantUpdateScalarSchema.merge(fkSchema.partial());
