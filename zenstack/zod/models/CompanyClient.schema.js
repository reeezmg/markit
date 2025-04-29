"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyClientUpdateSchema = exports.CompanyClientUpdateScalarSchema = exports.CompanyClientCreateSchema = exports.CompanyClientCreateScalarSchema = exports.CompanyClientPrismaUpdateSchema = exports.CompanyClientPrismaCreateSchema = exports.CompanyClientSchema = exports.CompanyClientScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    clientId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    client: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    clientId: zod_1.z.string(),
});
/**
 * `CompanyClient` schema excluding foreign keys and relations.
 */
exports.CompanyClientScalarSchema = baseSchema;
/**
 * `CompanyClient` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.CompanyClientSchema = exports.CompanyClientScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.CompanyClientPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.CompanyClientPrismaUpdateSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    clientId: zod_1.z.string()
}).partial().passthrough();
/**
 * `CompanyClient` schema for create operations excluding foreign keys and relations.
 */
exports.CompanyClientCreateScalarSchema = baseSchema;
/**
 * `CompanyClient` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.CompanyClientCreateSchema = exports.CompanyClientCreateScalarSchema.merge(fkSchema);
/**
 * `CompanyClient` schema for update operations excluding foreign keys and relations.
 */
exports.CompanyClientUpdateScalarSchema = baseSchema.partial();
/**
 * `CompanyClient` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.CompanyClientUpdateSchema = exports.CompanyClientUpdateScalarSchema.merge(fkSchema.partial());
