"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LikeUpdateSchema = exports.LikeUpdateScalarSchema = exports.LikeCreateSchema = exports.LikeCreateScalarSchema = exports.LikePrismaUpdateSchema = exports.LikePrismaCreateSchema = exports.LikeSchema = exports.LikeScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    variantIds: zod_1.z.array(zod_1.z.string()),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
}).strict();
const relationSchema = zod_1.z.object({
    clientCompany: zod_1.z.record(zod_1.z.unknown()).optional(),
});
/**
 * `Like` schema excluding foreign keys and relations.
 */
exports.LikeScalarSchema = baseSchema;
/**
 * `Like` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.LikeSchema = exports.LikeScalarSchema.merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.LikePrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.LikePrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    variantIds: zod_1.z.array(zod_1.z.string()),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `Like` schema for create operations excluding foreign keys and relations.
 */
exports.LikeCreateScalarSchema = baseSchema.partial({
    id: true, variantIds: true, createdAt: true, updatedAt: true
});
/**
 * `Like` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.LikeCreateSchema = baseSchema.partial({
    id: true, variantIds: true, createdAt: true, updatedAt: true
});
/**
 * `Like` schema for update operations excluding foreign keys and relations.
 */
exports.LikeUpdateScalarSchema = baseSchema.partial();
/**
 * `Like` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.LikeUpdateSchema = exports.LikeUpdateScalarSchema;
