"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrderUpdateSchema = exports.PurchaseOrderUpdateScalarSchema = exports.PurchaseOrderCreateSchema = exports.PurchaseOrderCreateScalarSchema = exports.PurchaseOrderPrismaUpdateSchema = exports.PurchaseOrderPrismaCreateSchema = exports.PurchaseOrderSchema = exports.PurchaseOrderScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const PaymentType_schema_1 = require("../enums/PaymentType.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    paymentType: PaymentType_schema_1.PaymentTypeSchema.nullish(),
    totalAmount: zod_1.z.number().default(0),
}).strict();
const relationSchema = zod_1.z.object({
    products: zod_1.z.array(zod_1.z.unknown()).optional(),
    company: zod_1.z.record(zod_1.z.unknown()),
    distributorCompany: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    distributorId: zod_1.z.string().nullish(),
});
/**
 * `PurchaseOrder` schema excluding foreign keys and relations.
 */
exports.PurchaseOrderScalarSchema = baseSchema;
/**
 * `PurchaseOrder` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.PurchaseOrderSchema = exports.PurchaseOrderScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.PurchaseOrderPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.PurchaseOrderPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    paymentType: PaymentType_schema_1.PaymentTypeSchema.nullish(),
    totalAmount: zod_1.z.union([zod_1.z.number().default(0), zod_1.z.record(zod_1.z.unknown())])
}).partial().passthrough();
/**
 * `PurchaseOrder` schema for create operations excluding foreign keys and relations.
 */
exports.PurchaseOrderCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, totalAmount: true
});
/**
 * `PurchaseOrder` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.PurchaseOrderCreateSchema = exports.PurchaseOrderCreateScalarSchema.merge(fkSchema);
/**
 * `PurchaseOrder` schema for update operations excluding foreign keys and relations.
 */
exports.PurchaseOrderUpdateScalarSchema = baseSchema.partial();
/**
 * `PurchaseOrder` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.PurchaseOrderUpdateSchema = exports.PurchaseOrderUpdateScalarSchema.merge(fkSchema.partial());
