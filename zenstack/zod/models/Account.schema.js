"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountUpdateSchema = exports.AccountUpdateScalarSchema = exports.AccountCreateSchema = exports.AccountCreateScalarSchema = exports.AccountPrismaUpdateSchema = exports.AccountPrismaCreateSchema = exports.AccountSchema = exports.AccountScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    phone: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    bill: zod_1.z.array(zod_1.z.unknown()).optional(),
    address: zod_1.z.record(zod_1.z.unknown()).optional(),
    company: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `Account` schema excluding foreign keys and relations.
 */
exports.AccountScalarSchema = baseSchema;
/**
 * `Account` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.AccountSchema = exports.AccountScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.AccountPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.AccountPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    phone: zod_1.z.string()
}).partial().passthrough();
/**
 * `Account` schema for create operations excluding foreign keys and relations.
 */
exports.AccountCreateScalarSchema = baseSchema.partial({
    id: true
});
/**
 * `Account` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.AccountCreateSchema = exports.AccountCreateScalarSchema.merge(fkSchema);
/**
 * `Account` schema for update operations excluding foreign keys and relations.
 */
exports.AccountUpdateScalarSchema = baseSchema.partial();
/**
 * `Account` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.AccountUpdateSchema = exports.AccountUpdateScalarSchema.merge(fkSchema.partial());
