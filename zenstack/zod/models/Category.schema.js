"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryUpdateSchema = exports.CategoryUpdateScalarSchema = exports.CategoryCreateSchema = exports.CategoryCreateScalarSchema = exports.CategoryPrismaUpdateSchema = exports.CategoryPrismaCreateSchema = exports.CategorySchema = exports.CategoryScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const TaxType_schema_1 = require("../enums/TaxType.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().min(1).max(256),
    description: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    image: zod_1.z.string().nullish(),
    hsn: zod_1.z.string().nullish(),
    taxType: TaxType_schema_1.TaxTypeSchema,
    fixedTax: zod_1.z.number().nullish(),
    thresholdAmount: zod_1.z.number().nullish(),
    taxBelowThreshold: zod_1.z.number().nullish(),
    taxAboveThreshold: zod_1.z.number().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    products: zod_1.z.array(zod_1.z.unknown()).optional(),
    subcategories: zod_1.z.array(zod_1.z.unknown()).optional(),
    entries: zod_1.z.array(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `Category` schema excluding foreign keys and relations.
 */
exports.CategoryScalarSchema = baseSchema;
/**
 * `Category` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.CategorySchema = exports.CategoryScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.CategoryPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.CategoryPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().min(1).max(256),
    description: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    image: zod_1.z.string().nullish(),
    hsn: zod_1.z.string().nullish(),
    taxType: TaxType_schema_1.TaxTypeSchema,
    fixedTax: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    thresholdAmount: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    taxBelowThreshold: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    taxAboveThreshold: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())])
}).partial().passthrough();
/**
 * `Category` schema for create operations excluding foreign keys and relations.
 */
exports.CategoryCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, status: true, taxType: true
});
/**
 * `Category` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.CategoryCreateSchema = exports.CategoryCreateScalarSchema.merge(fkSchema);
/**
 * `Category` schema for update operations excluding foreign keys and relations.
 */
exports.CategoryUpdateScalarSchema = baseSchema.partial();
/**
 * `Category` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.CategoryUpdateSchema = exports.CategoryUpdateScalarSchema.merge(fkSchema.partial());
