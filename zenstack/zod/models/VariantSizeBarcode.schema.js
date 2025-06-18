"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VariantSizeBarcodeUpdateSchema = exports.VariantSizeBarcodeUpdateScalarSchema = exports.VariantSizeBarcodeCreateSchema = exports.VariantSizeBarcodeCreateScalarSchema = exports.VariantSizeBarcodePrismaUpdateSchema = exports.VariantSizeBarcodePrismaCreateSchema = exports.VariantSizeBarcodeSchema = exports.VariantSizeBarcodeScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.number(),
    size: zod_1.z.string().nullish(),
    barcode: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    variant: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    variantId: zod_1.z.string(),
});
/**
 * `VariantSizeBarcode` schema excluding foreign keys and relations.
 */
exports.VariantSizeBarcodeScalarSchema = baseSchema;
/**
 * `VariantSizeBarcode` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.VariantSizeBarcodeSchema = exports.VariantSizeBarcodeScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.VariantSizeBarcodePrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.VariantSizeBarcodePrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    size: zod_1.z.string().nullish(),
    barcode: zod_1.z.string()
}).partial().passthrough();
/**
 * `VariantSizeBarcode` schema for create operations excluding foreign keys and relations.
 */
exports.VariantSizeBarcodeCreateScalarSchema = baseSchema.partial({
    id: true
});
/**
 * `VariantSizeBarcode` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.VariantSizeBarcodeCreateSchema = exports.VariantSizeBarcodeCreateScalarSchema.merge(fkSchema);
/**
 * `VariantSizeBarcode` schema for update operations excluding foreign keys and relations.
 */
exports.VariantSizeBarcodeUpdateScalarSchema = baseSchema.partial();
/**
 * `VariantSizeBarcode` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.VariantSizeBarcodeUpdateSchema = exports.VariantSizeBarcodeUpdateScalarSchema.merge(fkSchema.partial());
