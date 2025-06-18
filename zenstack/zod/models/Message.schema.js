"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageUpdateSchema = exports.MessageUpdateScalarSchema = exports.MessageCreateSchema = exports.MessageCreateScalarSchema = exports.MessagePrismaUpdateSchema = exports.MessagePrismaCreateSchema = exports.MessageSchema = exports.MessageScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    senderId: zod_1.z.string(),
    text: zod_1.z.string(),
    seen: zod_1.z.array(zod_1.z.string()),
    replyto: zod_1.z.string().nullish(),
    edited: zod_1.z.boolean().default(false),
    deleted: zod_1.z.boolean().default(false),
}).strict();
const relationSchema = zod_1.z.object({
    conversation: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
});
/**
 * `Message` schema excluding foreign keys and relations.
 */
exports.MessageScalarSchema = baseSchema;
/**
 * `Message` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.MessageSchema = exports.MessageScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.MessagePrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.MessagePrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
    senderId: zod_1.z.string(),
    text: zod_1.z.string(),
    seen: zod_1.z.array(zod_1.z.string()),
    replyto: zod_1.z.string().nullish(),
    edited: zod_1.z.boolean().default(false),
    deleted: zod_1.z.boolean().default(false)
}).partial().passthrough();
/**
 * `Message` schema for create operations excluding foreign keys and relations.
 */
exports.MessageCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true, seen: true, edited: true, deleted: true
});
/**
 * `Message` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.MessageCreateSchema = exports.MessageCreateScalarSchema.merge(fkSchema);
/**
 * `Message` schema for update operations excluding foreign keys and relations.
 */
exports.MessageUpdateScalarSchema = baseSchema.partial();
/**
 * `Message` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.MessageUpdateSchema = exports.MessageUpdateScalarSchema.merge(fkSchema.partial());
