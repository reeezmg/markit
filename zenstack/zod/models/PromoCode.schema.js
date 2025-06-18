"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoCodeUpdateSchema = exports.PromoCodeUpdateScalarSchema = exports.PromoCodeCreateSchema = exports.PromoCodeCreateScalarSchema = exports.PromoCodePrismaUpdateSchema = exports.PromoCodePrismaCreateSchema = exports.PromoCodeSchema = exports.PromoCodeScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    code: zod_1.z.string(),
    discountPercent: zod_1.z.number(),
    minAmount: zod_1.z.number(),
    expiresAt: zod_1.z.coerce.date(),
    isActive: zod_1.z.boolean().default(true),
    usageLimit: zod_1.z.number().nullish(),
    usageCount: zod_1.z.number().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    clientsUsed: zod_1.z.array(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `PromoCode` schema excluding foreign keys and relations.
 */
exports.PromoCodeScalarSchema = baseSchema;
/**
 * `PromoCode` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.PromoCodeSchema = exports.PromoCodeScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.PromoCodePrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.PromoCodePrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    code: zod_1.z.string(),
    discountPercent: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    minAmount: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    expiresAt: zod_1.z.coerce.date(),
    isActive: zod_1.z.boolean().default(true),
    usageLimit: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    usageCount: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())])
}).partial().passthrough();
/**
 * `PromoCode` schema for create operations excluding foreign keys and relations.
 */
exports.PromoCodeCreateScalarSchema = baseSchema.partial({
    id: true, isActive: true
});
/**
 * `PromoCode` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.PromoCodeCreateSchema = exports.PromoCodeCreateScalarSchema.merge(fkSchema);
/**
 * `PromoCode` schema for update operations excluding foreign keys and relations.
 */
exports.PromoCodeUpdateScalarSchema = baseSchema.partial();
/**
 * `PromoCode` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.PromoCodeUpdateSchema = exports.PromoCodeUpdateScalarSchema.merge(fkSchema.partial());
