"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserUpdateSchema = exports.UserUpdateScalarSchema = exports.UserCreateSchema = exports.UserCreateScalarSchema = exports.UserPrismaUpdateSchema = exports.UserPrismaCreateSchema = exports.UserSchema = exports.UserScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const UserRole_schema_1 = require("../enums/UserRole.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    name: zod_1.z.string().nullish(),
    password: zod_1.z.string(),
    status: zod_1.z.boolean().default(true),
    role: UserRole_schema_1.UserRoleSchema,
    image: zod_1.z.string().nullish(),
}).strict();
const relationSchema = zod_1.z.object({
    companies: zod_1.z.array(zod_1.z.unknown()).optional(),
    address: zod_1.z.record(zod_1.z.unknown()).optional(),
    notifications: zod_1.z.array(zod_1.z.unknown()).optional(),
    conversations: zod_1.z.array(zod_1.z.unknown()).optional(),
    clients: zod_1.z.array(zod_1.z.unknown()).optional(),
});
/**
 * `User` schema excluding foreign keys and relations.
 */
exports.UserScalarSchema = baseSchema;
/**
 * `User` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.UserSchema = exports.UserScalarSchema.merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.UserPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.UserPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    name: zod_1.z.string().nullish(),
    password: zod_1.z.string(),
    status: zod_1.z.boolean().default(true),
    role: UserRole_schema_1.UserRoleSchema,
    image: zod_1.z.string().nullish()
}).partial().passthrough();
/**
 * `User` schema for create operations excluding foreign keys and relations.
 */
exports.UserCreateScalarSchema = baseSchema.partial({
    id: true, status: true, role: true
});
/**
 * `User` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.UserCreateSchema = baseSchema.partial({
    id: true, status: true, role: true
});
/**
 * `User` schema for update operations excluding foreign keys and relations.
 */
exports.UserUpdateScalarSchema = baseSchema.partial();
/**
 * `User` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.UserUpdateSchema = exports.UserUpdateScalarSchema;
