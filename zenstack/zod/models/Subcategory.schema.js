"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubcategoryUpdateSchema = exports.SubcategoryUpdateScalarSchema = exports.SubcategoryCreateSchema = exports.SubcategoryCreateScalarSchema = exports.SubcategoryPrismaUpdateSchema = exports.SubcategoryPrismaCreateSchema = exports.SubcategorySchema = exports.SubcategoryScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().min(1).max(256),
    description: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    image: zod_1.z.string().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    products: zod_1.z.array(zod_1.z.unknown()).optional(),
    category: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    categoryId: zod_1.z.string().nullish(),
});
/**
 * `Subcategory` schema excluding foreign keys and relations.
 */
exports.SubcategoryScalarSchema = baseSchema;
/**
 * `Subcategory` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.SubcategorySchema = exports.SubcategoryScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.SubcategoryPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.SubcategoryPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().min(1).max(256),
    description: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    image: zod_1.z.string().nullish()
}).partial().passthrough();
/**
 * `Subcategory` schema for create operations excluding foreign keys and relations.
 */
exports.SubcategoryCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, status: true
});
/**
 * `Subcategory` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.SubcategoryCreateSchema = exports.SubcategoryCreateScalarSchema.merge(fkSchema);
/**
 * `Subcategory` schema for update operations excluding foreign keys and relations.
 */
exports.SubcategoryUpdateScalarSchema = baseSchema.partial();
/**
 * `Subcategory` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.SubcategoryUpdateSchema = exports.SubcategoryUpdateScalarSchema.merge(fkSchema.partial());
