"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartUpdateSchema = exports.CartUpdateScalarSchema = exports.CartCreateSchema = exports.CartCreateScalarSchema = exports.CartPrismaUpdateSchema = exports.CartPrismaCreateSchema = exports.CartSchema = exports.CartScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    items: zod_1.z.any().nullish(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
}).strict();
const relationSchema = zod_1.z.object({
    clientCompany: zod_1.z.record(zod_1.z.unknown()).optional(),
});
/**
 * `Cart` schema excluding foreign keys and relations.
 */
exports.CartScalarSchema = baseSchema;
/**
 * `Cart` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.CartSchema = exports.CartScalarSchema.merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.CartPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.CartPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    items: zod_1.z.any().nullish(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `Cart` schema for create operations excluding foreign keys and relations.
 */
exports.CartCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true
});
/**
 * `Cart` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.CartCreateSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true
});
/**
 * `Cart` schema for update operations excluding foreign keys and relations.
 */
exports.CartUpdateScalarSchema = baseSchema.partial();
/**
 * `Cart` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.CartUpdateSchema = exports.CartUpdateScalarSchema;
