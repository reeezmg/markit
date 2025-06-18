"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientPromoCodeUpdateSchema = exports.ClientPromoCodeUpdateScalarSchema = exports.ClientPromoCodeCreateSchema = exports.ClientPromoCodeCreateScalarSchema = exports.ClientPromoCodePrismaUpdateSchema = exports.ClientPromoCodePrismaCreateSchema = exports.ClientPromoCodeSchema = exports.ClientPromoCodeScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    usedAt: zod_1.z.coerce.date().default(() => new Date()),
}).strict();
const relationSchema = zod_1.z.object({
    client: zod_1.z.record(zod_1.z.unknown()),
    promoCode: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    promoCodeId: zod_1.z.string(),
});
/**
 * `ClientPromoCode` schema excluding foreign keys and relations.
 */
exports.ClientPromoCodeScalarSchema = baseSchema;
/**
 * `ClientPromoCode` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ClientPromoCodeSchema = exports.ClientPromoCodeScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ClientPromoCodePrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ClientPromoCodePrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    usedAt: zod_1.z.coerce.date().default(() => new Date())
}).partial().passthrough();
/**
 * `ClientPromoCode` schema for create operations excluding foreign keys and relations.
 */
exports.ClientPromoCodeCreateScalarSchema = baseSchema.partial({
    id: true, usedAt: true
});
/**
 * `ClientPromoCode` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ClientPromoCodeCreateSchema = exports.ClientPromoCodeCreateScalarSchema.merge(fkSchema);
/**
 * `ClientPromoCode` schema for update operations excluding foreign keys and relations.
 */
exports.ClientPromoCodeUpdateScalarSchema = baseSchema.partial();
/**
 * `ClientPromoCode` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ClientPromoCodeUpdateSchema = exports.ClientPromoCodeUpdateScalarSchema.merge(fkSchema.partial());
