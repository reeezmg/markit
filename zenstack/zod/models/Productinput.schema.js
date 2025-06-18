"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductinputUpdateSchema = exports.ProductinputUpdateScalarSchema = exports.ProductinputCreateSchema = exports.ProductinputCreateScalarSchema = exports.ProductinputPrismaUpdateSchema = exports.ProductinputPrismaCreateSchema = exports.ProductinputSchema = exports.ProductinputScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.boolean().default(true),
    brand: zod_1.z.boolean().default(true),
    category: zod_1.z.boolean().default(true),
    subcategory: zod_1.z.boolean().default(true),
    description: zod_1.z.boolean().default(true),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `Productinput` schema excluding foreign keys and relations.
 */
exports.ProductinputScalarSchema = baseSchema;
/**
 * `Productinput` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ProductinputSchema = exports.ProductinputScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ProductinputPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ProductinputPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.boolean().default(true),
    brand: zod_1.z.boolean().default(true),
    category: zod_1.z.boolean().default(true),
    subcategory: zod_1.z.boolean().default(true),
    description: zod_1.z.boolean().default(true)
}).partial().passthrough();
/**
 * `Productinput` schema for create operations excluding foreign keys and relations.
 */
exports.ProductinputCreateScalarSchema = baseSchema.partial({
    id: true, name: true, brand: true, category: true, subcategory: true, description: true
});
/**
 * `Productinput` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ProductinputCreateSchema = exports.ProductinputCreateScalarSchema.merge(fkSchema);
/**
 * `Productinput` schema for update operations excluding foreign keys and relations.
 */
exports.ProductinputUpdateScalarSchema = baseSchema.partial();
/**
 * `Productinput` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ProductinputUpdateSchema = exports.ProductinputUpdateScalarSchema.merge(fkSchema.partial());
