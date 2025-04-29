"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientUpdateSchema = exports.ClientUpdateScalarSchema = exports.ClientCreateSchema = exports.ClientCreateScalarSchema = exports.ClientPrismaUpdateSchema = exports.ClientPrismaCreateSchema = exports.ClientSchema = exports.ClientScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email().nullish(),
    name: zod_1.z.string(),
    password: zod_1.z.string().nullish(),
    phone: zod_1.z.string(),
    status: zod_1.z.boolean().default(true),
    pipelineStatus: zod_1.z.string().default("new"),
}).strict();
const relationSchema = zod_1.z.object({
    companies: zod_1.z.array(zod_1.z.unknown()).optional(),
    address: zod_1.z.array(zod_1.z.unknown()).optional(),
    bill: zod_1.z.record(zod_1.z.unknown()).optional(),
    conversations: zod_1.z.array(zod_1.z.unknown()).optional(),
    users: zod_1.z.array(zod_1.z.unknown()).optional(),
    newPipeline: zod_1.z.record(zod_1.z.unknown()).optional(),
    prospectPipeline: zod_1.z.record(zod_1.z.unknown()).optional(),
    viewingPipeline: zod_1.z.record(zod_1.z.unknown()).optional(),
    rejectPipeline: zod_1.z.record(zod_1.z.unknown()).optional(),
    closePipeline: zod_1.z.record(zod_1.z.unknown()).optional(),
    notifications: zod_1.z.array(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    newPipelineId: zod_1.z.string().nullish(),
    prospectPipelineId: zod_1.z.string().nullish(),
    viewingPipelineId: zod_1.z.string().nullish(),
    rejectPipelineId: zod_1.z.string().nullish(),
    closePipelineId: zod_1.z.string().nullish(),
});
/**
 * `Client` schema excluding foreign keys and relations.
 */
exports.ClientScalarSchema = baseSchema;
/**
 * `Client` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ClientSchema = exports.ClientScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ClientPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ClientPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email().nullish(),
    name: zod_1.z.string(),
    password: zod_1.z.string().nullish(),
    phone: zod_1.z.string(),
    status: zod_1.z.boolean().default(true),
    pipelineStatus: zod_1.z.string().default("new")
}).partial().passthrough();
/**
 * `Client` schema for create operations excluding foreign keys and relations.
 */
exports.ClientCreateScalarSchema = baseSchema.partial({
    id: true, status: true, pipelineStatus: true
});
/**
 * `Client` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ClientCreateSchema = exports.ClientCreateScalarSchema.merge(fkSchema);
/**
 * `Client` schema for update operations excluding foreign keys and relations.
 */
exports.ClientUpdateScalarSchema = baseSchema.partial();
/**
 * `Client` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ClientUpdateSchema = exports.ClientUpdateScalarSchema.merge(fkSchema.partial());
