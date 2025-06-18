"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartCompanyClientUpdateSchema = exports.CartCompanyClientUpdateScalarSchema = exports.CartCompanyClientCreateSchema = exports.CartCompanyClientCreateScalarSchema = exports.CartCompanyClientPrismaUpdateSchema = exports.CartCompanyClientPrismaCreateSchema = exports.CartCompanyClientSchema = exports.CartCompanyClientScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    cartId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    client: zod_1.z.record(zod_1.z.unknown()),
    company: zod_1.z.record(zod_1.z.unknown()),
    cart: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    companyId: zod_1.z.string(),
    cartId: zod_1.z.string(),
});
/**
 * `CartCompanyClient` schema excluding foreign keys and relations.
 */
exports.CartCompanyClientScalarSchema = baseSchema;
/**
 * `CartCompanyClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.CartCompanyClientSchema = exports.CartCompanyClientScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.CartCompanyClientPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.CartCompanyClientPrismaUpdateSchema = zod_1.z.object({
    cartId: zod_1.z.string()
}).partial().passthrough();
/**
 * `CartCompanyClient` schema for create operations excluding foreign keys and relations.
 */
exports.CartCompanyClientCreateScalarSchema = baseSchema;
/**
 * `CartCompanyClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.CartCompanyClientCreateSchema = exports.CartCompanyClientCreateScalarSchema.merge(fkSchema);
/**
 * `CartCompanyClient` schema for update operations excluding foreign keys and relations.
 */
exports.CartCompanyClientUpdateScalarSchema = baseSchema.partial();
/**
 * `CartCompanyClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.CartCompanyClientUpdateSchema = exports.CartCompanyClientUpdateScalarSchema.merge(fkSchema.partial());
