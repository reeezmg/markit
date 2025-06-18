"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineUpdateSchema = exports.PipelineUpdateScalarSchema = exports.PipelineCreateSchema = exports.PipelineCreateScalarSchema = exports.PipelinePrismaUpdateSchema = exports.PipelinePrismaCreateSchema = exports.PipelineSchema = exports.PipelineScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    newClients: zod_1.z.array(zod_1.z.unknown()).optional(),
    prospectClients: zod_1.z.array(zod_1.z.unknown()).optional(),
    viewingClients: zod_1.z.array(zod_1.z.unknown()).optional(),
    rejectClients: zod_1.z.array(zod_1.z.unknown()).optional(),
    closeClients: zod_1.z.array(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
});
/**
 * `Pipeline` schema excluding foreign keys and relations.
 */
exports.PipelineScalarSchema = baseSchema;
/**
 * `Pipeline` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.PipelineSchema = exports.PipelineScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.PipelinePrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.PipelinePrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string()
}).partial().passthrough();
/**
 * `Pipeline` schema for create operations excluding foreign keys and relations.
 */
exports.PipelineCreateScalarSchema = baseSchema.partial({
    id: true
});
/**
 * `Pipeline` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.PipelineCreateSchema = exports.PipelineCreateScalarSchema.merge(fkSchema);
/**
 * `Pipeline` schema for update operations excluding foreign keys and relations.
 */
exports.PipelineUpdateScalarSchema = baseSchema.partial();
/**
 * `Pipeline` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.PipelineUpdateSchema = exports.PipelineUpdateScalarSchema.merge(fkSchema.partial());
