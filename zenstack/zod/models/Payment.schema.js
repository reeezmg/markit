"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentUpdateSchema = exports.PaymentUpdateScalarSchema = exports.PaymentCreateSchema = exports.PaymentCreateScalarSchema = exports.PaymentPrismaUpdateSchema = exports.PaymentPrismaCreateSchema = exports.PaymentSchema = exports.PaymentScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    paymentDate: zod_1.z.coerce.date().default(() => new Date()),
    paymentMode: zod_1.z.string(),
    paymentReference: zod_1.z.string().nullish(),
    amount: zod_1.z.number(),
    currency: zod_1.z.string().default("INR"),
    status: zod_1.z.string().default("Completed"),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `Payment` schema excluding foreign keys and relations.
 */
exports.PaymentScalarSchema = baseSchema;
/**
 * `Payment` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.PaymentSchema = exports.PaymentScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.PaymentPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.PaymentPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    paymentDate: zod_1.z.coerce.date().default(() => new Date()),
    paymentMode: zod_1.z.string(),
    paymentReference: zod_1.z.string().nullish(),
    amount: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    currency: zod_1.z.string().default("INR"),
    status: zod_1.z.string().default("Completed"),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `Payment` schema for create operations excluding foreign keys and relations.
 */
exports.PaymentCreateScalarSchema = baseSchema.partial({
    id: true, paymentDate: true, currency: true, status: true, createdAt: true, updatedAt: true
});
/**
 * `Payment` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.PaymentCreateSchema = exports.PaymentCreateScalarSchema.merge(fkSchema);
/**
 * `Payment` schema for update operations excluding foreign keys and relations.
 */
exports.PaymentUpdateScalarSchema = baseSchema.partial();
/**
 * `Payment` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.PaymentUpdateSchema = exports.PaymentUpdateScalarSchema.merge(fkSchema.partial());
