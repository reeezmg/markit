"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailOtpUpdateSchema = exports.EmailOtpUpdateScalarSchema = exports.EmailOtpCreateSchema = exports.EmailOtpCreateScalarSchema = exports.EmailOtpPrismaUpdateSchema = exports.EmailOtpPrismaCreateSchema = exports.EmailOtpSchema = exports.EmailOtpScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    otp: zod_1.z.string(),
    expiresAt: zod_1.z.coerce.date(),
}).strict();
/**
 * `EmailOtp` schema excluding foreign keys and relations.
 */
exports.EmailOtpScalarSchema = baseSchema;
/**
 * `EmailOtp` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.EmailOtpSchema = exports.EmailOtpScalarSchema;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.EmailOtpPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.EmailOtpPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    otp: zod_1.z.string(),
    expiresAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `EmailOtp` schema for create operations excluding foreign keys and relations.
 */
exports.EmailOtpCreateScalarSchema = baseSchema.partial({
    id: true
});
/**
 * `EmailOtp` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.EmailOtpCreateSchema = baseSchema.partial({
    id: true
});
/**
 * `EmailOtp` schema for update operations excluding foreign keys and relations.
 */
exports.EmailOtpUpdateScalarSchema = baseSchema.partial();
/**
 * `EmailOtp` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.EmailOtpUpdateSchema = exports.EmailOtpUpdateScalarSchema;
