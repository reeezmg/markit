"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributorCompanyUpdateSchema = exports.DistributorCompanyUpdateScalarSchema = exports.DistributorCompanyCreateSchema = exports.DistributorCompanyCreateScalarSchema = exports.DistributorCompanyPrismaUpdateSchema = exports.DistributorCompanyPrismaCreateSchema = exports.DistributorCompanySchema = exports.DistributorCompanyScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    distributorId: zod_1.z.string(),
    companyId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    distributor: zod_1.z.record(zod_1.z.unknown()),
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    distributorId: zod_1.z.string(),
    companyId: zod_1.z.string(),
});
/**
 * `DistributorCompany` schema excluding foreign keys and relations.
 */
exports.DistributorCompanyScalarSchema = baseSchema;
/**
 * `DistributorCompany` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.DistributorCompanySchema = exports.DistributorCompanyScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.DistributorCompanyPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.DistributorCompanyPrismaUpdateSchema = zod_1.z.object({
    distributorId: zod_1.z.string(),
    companyId: zod_1.z.string()
}).partial().passthrough();
/**
 * `DistributorCompany` schema for create operations excluding foreign keys and relations.
 */
exports.DistributorCompanyCreateScalarSchema = baseSchema;
/**
 * `DistributorCompany` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorCompanyCreateSchema = exports.DistributorCompanyCreateScalarSchema.merge(fkSchema);
/**
 * `DistributorCompany` schema for update operations excluding foreign keys and relations.
 */
exports.DistributorCompanyUpdateScalarSchema = baseSchema.partial();
/**
 * `DistributorCompany` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorCompanyUpdateSchema = exports.DistributorCompanyUpdateScalarSchema.merge(fkSchema.partial());
