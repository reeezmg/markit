"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyUserUpdateSchema = exports.CompanyUserUpdateScalarSchema = exports.CompanyUserCreateSchema = exports.CompanyUserCreateScalarSchema = exports.CompanyUserPrismaUpdateSchema = exports.CompanyUserPrismaCreateSchema = exports.CompanyUserSchema = exports.CompanyUserScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    userId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    user: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    userId: zod_1.z.string(),
});
/**
 * `CompanyUser` schema excluding foreign keys and relations.
 */
exports.CompanyUserScalarSchema = baseSchema;
/**
 * `CompanyUser` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.CompanyUserSchema = exports.CompanyUserScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.CompanyUserPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.CompanyUserPrismaUpdateSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    userId: zod_1.z.string()
}).partial().passthrough();
/**
 * `CompanyUser` schema for create operations excluding foreign keys and relations.
 */
exports.CompanyUserCreateScalarSchema = baseSchema;
/**
 * `CompanyUser` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.CompanyUserCreateSchema = exports.CompanyUserCreateScalarSchema.merge(fkSchema);
/**
 * `CompanyUser` schema for update operations excluding foreign keys and relations.
 */
exports.CompanyUserUpdateScalarSchema = baseSchema.partial();
/**
 * `CompanyUser` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.CompanyUserUpdateSchema = exports.CompanyUserUpdateScalarSchema.merge(fkSchema.partial());
