"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributorUpdateSchema = exports.DistributorUpdateScalarSchema = exports.DistributorCreateSchema = exports.DistributorCreateScalarSchema = exports.DistributorPrismaUpdateSchema = exports.DistributorPrismaCreateSchema = exports.DistributorSchema = exports.DistributorScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    images: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    accHolderName: zod_1.z.string().nullish(),
    ifsc: zod_1.z.string().nullish(),
    accountNo: zod_1.z.string().nullish(),
    bankName: zod_1.z.string().nullish(),
    gstin: zod_1.z.string().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    companies: zod_1.z.array(zod_1.z.unknown()).optional(),
    purchaseorders: zod_1.z.array(zod_1.z.unknown()).optional(),
    address: zod_1.z.record(zod_1.z.unknown()).optional(),
});
/**
 * `Distributor` schema excluding foreign keys and relations.
 */
exports.DistributorScalarSchema = baseSchema;
/**
 * `Distributor` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.DistributorSchema = exports.DistributorScalarSchema.merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.DistributorPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.DistributorPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    images: zod_1.z.string().nullish(),
    status: zod_1.z.boolean().default(true),
    accHolderName: zod_1.z.string().nullish(),
    ifsc: zod_1.z.string().nullish(),
    accountNo: zod_1.z.string().nullish(),
    bankName: zod_1.z.string().nullish(),
    gstin: zod_1.z.string().nullish()
}).partial().passthrough();
/**
 * `Distributor` schema for create operations excluding foreign keys and relations.
 */
exports.DistributorCreateScalarSchema = baseSchema.partial({
    id: true, status: true
});
/**
 * `Distributor` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorCreateSchema = baseSchema.partial({
    id: true, status: true
});
/**
 * `Distributor` schema for update operations excluding foreign keys and relations.
 */
exports.DistributorUpdateScalarSchema = baseSchema.partial();
/**
 * `Distributor` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorUpdateSchema = exports.DistributorUpdateScalarSchema;
