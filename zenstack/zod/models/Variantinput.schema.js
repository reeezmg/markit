"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VariantinputUpdateSchema = exports.VariantinputUpdateScalarSchema = exports.VariantinputCreateSchema = exports.VariantinputCreateScalarSchema = exports.VariantinputPrismaUpdateSchema = exports.VariantinputPrismaCreateSchema = exports.VariantinputSchema = exports.VariantinputScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.boolean().default(true),
    code: zod_1.z.boolean().default(true),
    sprice: zod_1.z.boolean().default(true),
    pprice: zod_1.z.boolean().default(true),
    dprice: zod_1.z.boolean().default(true),
    discount: zod_1.z.boolean().default(true),
    qty: zod_1.z.boolean().default(true),
    sizes: zod_1.z.boolean().default(true),
    images: zod_1.z.boolean().default(true),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `Variantinput` schema excluding foreign keys and relations.
 */
exports.VariantinputScalarSchema = baseSchema;
/**
 * `Variantinput` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.VariantinputSchema = exports.VariantinputScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.VariantinputPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.VariantinputPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.boolean().default(true),
    code: zod_1.z.boolean().default(true),
    sprice: zod_1.z.boolean().default(true),
    pprice: zod_1.z.boolean().default(true),
    dprice: zod_1.z.boolean().default(true),
    discount: zod_1.z.boolean().default(true),
    qty: zod_1.z.boolean().default(true),
    sizes: zod_1.z.boolean().default(true),
    images: zod_1.z.boolean().default(true)
}).partial().passthrough();
/**
 * `Variantinput` schema for create operations excluding foreign keys and relations.
 */
exports.VariantinputCreateScalarSchema = baseSchema.partial({
    id: true, name: true, code: true, sprice: true, pprice: true, dprice: true, discount: true, qty: true, sizes: true, images: true
});
/**
 * `Variantinput` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.VariantinputCreateSchema = exports.VariantinputCreateScalarSchema.merge(fkSchema);
/**
 * `Variantinput` schema for update operations excluding foreign keys and relations.
 */
exports.VariantinputUpdateScalarSchema = baseSchema.partial();
/**
 * `Variantinput` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.VariantinputUpdateSchema = exports.VariantinputUpdateScalarSchema.merge(fkSchema.partial());
