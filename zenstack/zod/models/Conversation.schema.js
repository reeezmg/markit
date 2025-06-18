"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationUpdateSchema = exports.ConversationUpdateScalarSchema = exports.ConversationCreateSchema = exports.ConversationCreateScalarSchema = exports.ConversationPrismaUpdateSchema = exports.ConversationPrismaCreateSchema = exports.ConversationSchema = exports.ConversationScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
}).strict();
const relationSchema = zod_1.z.object({
    messages: zod_1.z.array(zod_1.z.unknown()).optional(),
    users: zod_1.z.array(zod_1.z.unknown()).optional(),
    clients: zod_1.z.array(zod_1.z.unknown()).optional(),
});
/**
 * `Conversation` schema excluding foreign keys and relations.
 */
exports.ConversationScalarSchema = baseSchema;
/**
 * `Conversation` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ConversationSchema = exports.ConversationScalarSchema.merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ConversationPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ConversationPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `Conversation` schema for create operations excluding foreign keys and relations.
 */
exports.ConversationCreateScalarSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true
});
/**
 * `Conversation` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ConversationCreateSchema = baseSchema.partial({
    id: true, createdAt: true, updatedAt: true
});
/**
 * `Conversation` schema for update operations excluding foreign keys and relations.
 */
exports.ConversationUpdateScalarSchema = baseSchema.partial();
/**
 * `Conversation` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ConversationUpdateSchema = exports.ConversationUpdateScalarSchema;
