"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserClientUpdateSchema = exports.UserClientUpdateScalarSchema = exports.UserClientCreateSchema = exports.UserClientCreateScalarSchema = exports.UserClientPrismaUpdateSchema = exports.UserClientPrismaCreateSchema = exports.UserClientSchema = exports.UserClientScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    userId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    client: zod_1.z.record(zod_1.z.unknown()),
    user: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    userId: zod_1.z.string(),
});
/**
 * `UserClient` schema excluding foreign keys and relations.
 */
exports.UserClientScalarSchema = baseSchema;
/**
 * `UserClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.UserClientSchema = exports.UserClientScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.UserClientPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.UserClientPrismaUpdateSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    userId: zod_1.z.string()
}).partial().passthrough();
/**
 * `UserClient` schema for create operations excluding foreign keys and relations.
 */
exports.UserClientCreateScalarSchema = baseSchema;
/**
 * `UserClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.UserClientCreateSchema = exports.UserClientCreateScalarSchema.merge(fkSchema);
/**
 * `UserClient` schema for update operations excluding foreign keys and relations.
 */
exports.UserClientUpdateScalarSchema = baseSchema.partial();
/**
 * `UserClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.UserClientUpdateSchema = exports.UserClientUpdateScalarSchema.merge(fkSchema.partial());
