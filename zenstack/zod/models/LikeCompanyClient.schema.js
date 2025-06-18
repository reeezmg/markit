"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LikeCompanyClientUpdateSchema = exports.LikeCompanyClientUpdateScalarSchema = exports.LikeCompanyClientCreateSchema = exports.LikeCompanyClientCreateScalarSchema = exports.LikeCompanyClientPrismaUpdateSchema = exports.LikeCompanyClientPrismaCreateSchema = exports.LikeCompanyClientSchema = exports.LikeCompanyClientScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    likeId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    client: zod_1.z.record(zod_1.z.unknown()),
    company: zod_1.z.record(zod_1.z.unknown()),
    like: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    companyId: zod_1.z.string(),
    likeId: zod_1.z.string(),
});
/**
 * `LikeCompanyClient` schema excluding foreign keys and relations.
 */
exports.LikeCompanyClientScalarSchema = baseSchema;
/**
 * `LikeCompanyClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.LikeCompanyClientSchema = exports.LikeCompanyClientScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.LikeCompanyClientPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.LikeCompanyClientPrismaUpdateSchema = zod_1.z.object({
    likeId: zod_1.z.string()
}).partial().passthrough();
/**
 * `LikeCompanyClient` schema for create operations excluding foreign keys and relations.
 */
exports.LikeCompanyClientCreateScalarSchema = baseSchema;
/**
 * `LikeCompanyClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.LikeCompanyClientCreateSchema = exports.LikeCompanyClientCreateScalarSchema.merge(fkSchema);
/**
 * `LikeCompanyClient` schema for update operations excluding foreign keys and relations.
 */
exports.LikeCompanyClientUpdateScalarSchema = baseSchema.partial();
/**
 * `LikeCompanyClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.LikeCompanyClientUpdateSchema = exports.LikeCompanyClientUpdateScalarSchema.merge(fkSchema.partial());
