"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressUpdateSchema = exports.AddressUpdateScalarSchema = exports.AddressCreateSchema = exports.AddressCreateScalarSchema = exports.AddressPrismaUpdateSchema = exports.AddressPrismaCreateSchema = exports.AddressSchema = exports.AddressScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().nullish(),
    street: zod_1.z.string(),
    locality: zod_1.z.string(),
    city: zod_1.z.string(),
    state: zod_1.z.string(),
    pincode: zod_1.z.string(),
    active: zod_1.z.boolean().default(true),
}).strict();
const relationSchema = zod_1.z.object({
    user: zod_1.z.record(zod_1.z.unknown()).optional(),
    client: zod_1.z.record(zod_1.z.unknown()).optional(),
    distributor: zod_1.z.record(zod_1.z.unknown()).optional(),
    company: zod_1.z.record(zod_1.z.unknown()).optional(),
    account: zod_1.z.record(zod_1.z.unknown()).optional(),
    bill: zod_1.z.array(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    userId: zod_1.z.string().nullish(),
    clientId: zod_1.z.string().nullish(),
    distributorId: zod_1.z.string().nullish(),
    companyId: zod_1.z.string().nullish(),
    accountId: zod_1.z.string().nullish(),
});
/**
 * `Address` schema excluding foreign keys and relations.
 */
exports.AddressScalarSchema = baseSchema;
/**
 * `Address` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.AddressSchema = exports.AddressScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.AddressPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.AddressPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    name: zod_1.z.string().nullish(),
    street: zod_1.z.string(),
    locality: zod_1.z.string(),
    city: zod_1.z.string(),
    state: zod_1.z.string(),
    pincode: zod_1.z.string(),
    active: zod_1.z.boolean().default(true)
}).partial().passthrough();
/**
 * `Address` schema for create operations excluding foreign keys and relations.
 */
exports.AddressCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, active: true
});
/**
 * `Address` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.AddressCreateSchema = exports.AddressCreateScalarSchema.merge(fkSchema);
/**
 * `Address` schema for update operations excluding foreign keys and relations.
 */
exports.AddressUpdateScalarSchema = baseSchema.partial();
/**
 * `Address` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.AddressUpdateSchema = exports.AddressUpdateScalarSchema.merge(fkSchema.partial());
