"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributorPaymentUpdateSchema = exports.DistributorPaymentUpdateScalarSchema = exports.DistributorPaymentCreateSchema = exports.DistributorPaymentCreateScalarSchema = exports.DistributorPaymentPrismaUpdateSchema = exports.DistributorPaymentPrismaCreateSchema = exports.DistributorPaymentSchema = exports.DistributorPaymentScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const PaymentType_schema_1 = require("../enums/PaymentType.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    amount: zod_1.z.number(),
    remarks: zod_1.z.string().nullish(),
    paymentType: PaymentType_schema_1.PaymentTypeSchema.nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    distributorCompany: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    distributorId: zod_1.z.string(),
    companyId: zod_1.z.string(),
});
/**
 * `DistributorPayment` schema excluding foreign keys and relations.
 */
exports.DistributorPaymentScalarSchema = baseSchema;
/**
 * `DistributorPayment` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.DistributorPaymentSchema = exports.DistributorPaymentScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.DistributorPaymentPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.DistributorPaymentPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    amount: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    remarks: zod_1.z.string().nullish(),
    paymentType: PaymentType_schema_1.PaymentTypeSchema.nullish()
}).partial().passthrough();
/**
 * `DistributorPayment` schema for create operations excluding foreign keys and relations.
 */
exports.DistributorPaymentCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true
});
/**
 * `DistributorPayment` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorPaymentCreateSchema = exports.DistributorPaymentCreateScalarSchema.merge(fkSchema);
/**
 * `DistributorPayment` schema for update operations excluding foreign keys and relations.
 */
exports.DistributorPaymentUpdateScalarSchema = baseSchema.partial();
/**
 * `DistributorPayment` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.DistributorPaymentUpdateSchema = exports.DistributorPaymentUpdateScalarSchema.merge(fkSchema.partial());
