"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductUpdateSchema = exports.ProductUpdateScalarSchema = exports.ProductCreateSchema = exports.ProductCreateScalarSchema = exports.ProductPrismaUpdateSchema = exports.ProductPrismaCreateSchema = exports.ProductSchema = exports.ProductScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string(),
    brand: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    rating: zod_1.z.number().nullish(),
    description: zod_1.z.string().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    category: zod_1.z.record(zod_1.z.unknown()).optional(),
    subcategory: zod_1.z.record(zod_1.z.unknown()).optional(),
    variants: zod_1.z.array(zod_1.z.unknown()).optional(),
    purchaseorder: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    categoryId: zod_1.z.string().nullish(),
    subcategoryId: zod_1.z.string().nullish(),
    purchaseorderId: zod_1.z.string(),
});
/**
 * `Product` schema excluding foreign keys and relations.
 */
exports.ProductScalarSchema = baseSchema;
/**
 * `Product` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ProductSchema = exports.ProductScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ProductPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ProductPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string(),
    brand: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    rating: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    description: zod_1.z.string().nullish()
}).partial().passthrough();
/**
 * `Product` schema for create operations excluding foreign keys and relations.
 */
exports.ProductCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, status: true
});
/**
 * `Product` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ProductCreateSchema = exports.ProductCreateScalarSchema.merge(fkSchema);
/**
 * `Product` schema for update operations excluding foreign keys and relations.
 */
exports.ProductUpdateScalarSchema = baseSchema.partial();
/**
 * `Product` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ProductUpdateSchema = exports.ProductUpdateScalarSchema.merge(fkSchema.partial());
