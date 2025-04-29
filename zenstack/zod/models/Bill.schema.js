"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillUpdateSchema = exports.BillUpdateScalarSchema = exports.BillCreateSchema = exports.BillCreateScalarSchema = exports.BillPrismaUpdateSchema = exports.BillPrismaCreateSchema = exports.BillSchema = exports.BillScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const PaymentStatus_schema_1 = require("../enums/PaymentStatus.schema");
const OrderType_schema_1 = require("../enums/OrderType.schema");
const OrderStatus_schema_1 = require("../enums/OrderStatus.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date(),
    invoiceNumber: zod_1.z.number().nullish(),
    subtotal: zod_1.z.number().nullish(),
    discount: zod_1.z.number().nullish(),
    tax: zod_1.z.number().nullish(),
    grandTotal: zod_1.z.number().nullish(),
    deliveryFees: zod_1.z.number().nullish(),
    paymentMethod: zod_1.z.string().nullish(),
    paymentStatus: PaymentStatus_schema_1.PaymentStatusSchema,
    transactionId: zod_1.z.string().nullish(),
    notes: zod_1.z.string().nullish(),
    type: OrderType_schema_1.OrderTypeSchema.nullish(),
    status: OrderStatus_schema_1.OrderStatusSchema.nullish(),
    deleted: zod_1.z.boolean().default(false).nullish(),
    bookingDate: zod_1.z.coerce.date().nullish(),
    returnDeadline: zod_1.z.string().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    entries: zod_1.z.array(zod_1.z.unknown()).optional(),
    company: zod_1.z.record(zod_1.z.unknown()),
    account: zod_1.z.record(zod_1.z.unknown()).optional(),
    client: zod_1.z.record(zod_1.z.unknown()).optional(),
    address: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    accountId: zod_1.z.string().nullish(),
    clientId: zod_1.z.string().nullish(),
    addressId: zod_1.z.string().nullish(),
});
/**
 * `Bill` schema excluding foreign keys and relations.
 */
exports.BillScalarSchema = baseSchema;
/**
 * `Bill` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.BillSchema = exports.BillScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.BillPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.BillPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date(),
    invoiceNumber: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    subtotal: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    discount: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    tax: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    grandTotal: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    deliveryFees: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    paymentMethod: zod_1.z.string().nullish(),
    paymentStatus: PaymentStatus_schema_1.PaymentStatusSchema,
    transactionId: zod_1.z.string().nullish(),
    notes: zod_1.z.string().nullish(),
    type: OrderType_schema_1.OrderTypeSchema.nullish(),
    status: OrderStatus_schema_1.OrderStatusSchema.nullish(),
    deleted: zod_1.z.boolean().default(false).nullish(),
    bookingDate: zod_1.z.coerce.date().nullish(),
    returnDeadline: zod_1.z.string().nullish()
}).partial().passthrough();
/**
 * `Bill` schema for create operations excluding foreign keys and relations.
 */
exports.BillCreateScalarSchema = baseSchema.partial({
    id: true, paymentStatus: true, deleted: true
});
/**
 * `Bill` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.BillCreateSchema = exports.BillCreateScalarSchema.merge(fkSchema);
/**
 * `Bill` schema for update operations excluding foreign keys and relations.
 */
exports.BillUpdateScalarSchema = baseSchema.partial();
/**
 * `Bill` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.BillUpdateSchema = exports.BillUpdateScalarSchema.merge(fkSchema.partial());
