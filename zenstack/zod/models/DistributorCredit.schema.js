"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributorCreditUpdateSchema = exports.DistributorCreditUpdateScalarSchema = exports.DistributorCreditCreateSchema = exports.DistributorCreditCreateScalarSchema = exports.DistributorCreditPrismaUpdateSchema = exports.DistributorCreditPrismaCreateSchema = exports.DistributorCreditSchema = exports.DistributorCreditScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    amount: zod_1.z.number(),
    remarks: zod_1.z.string().nullish(),
    billNo: zod_1.z.string().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    distributorCompany: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    distributorId: zod_1.z.string(),
    companyId: zod_1.z.string(),
});
/**
 * `DistributorCredit` schema excluding foreign keys and relations.
 */
exports.DistributorCreditScalarSchema = baseSchema;
/**
 * `DistributorCredit` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.DistributorCreditSchema = exports.DistributorCreditScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.DistributorCreditPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.DistributorCreditPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    amount: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    remarks: zod_1.z.string().nullish(),
    billNo: zod_1.z.string().nullish()
}).partial().passthrough();
/**
 * `DistributorCredit` schema for create operations excluding foreign keys and relations.
 */
exports.DistributorCreditCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true
});
/**
 * `DistributorCredit` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorCreditCreateSchema = exports.DistributorCreditCreateScalarSchema.merge(fkSchema);
/**
 * `DistributorCredit` schema for update operations excluding foreign keys and relations.
 */
exports.DistributorCreditUpdateScalarSchema = baseSchema.partial();
/**
 * `DistributorCredit` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorCreditUpdateSchema = exports.DistributorCreditUpdateScalarSchema.merge(fkSchema.partial());
