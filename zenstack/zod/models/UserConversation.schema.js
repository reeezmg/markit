"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserConversationUpdateSchema = exports.UserConversationUpdateScalarSchema = exports.UserConversationCreateSchema = exports.UserConversationCreateScalarSchema = exports.UserConversationPrismaUpdateSchema = exports.UserConversationPrismaCreateSchema = exports.UserConversationSchema = exports.UserConversationScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    conversationId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    user: zod_1.z.record(zod_1.z.unknown()),
    conversation: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    conversationId: zod_1.z.string(),
});
/**
 * `UserConversation` schema excluding foreign keys and relations.
 */
exports.UserConversationScalarSchema = baseSchema;
/**
 * `UserConversation` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.UserConversationSchema = exports.UserConversationScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.UserConversationPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.UserConversationPrismaUpdateSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    conversationId: zod_1.z.string()
}).partial().passthrough();
/**
 * `UserConversation` schema for create operations excluding foreign keys and relations.
 */
exports.UserConversationCreateScalarSchema = baseSchema;
/**
 * `UserConversation` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.UserConversationCreateSchema = exports.UserConversationCreateScalarSchema.merge(fkSchema);
/**
 * `UserConversation` schema for update operations excluding foreign keys and relations.
 */
exports.UserConversationUpdateScalarSchema = baseSchema.partial();
/**
 * `UserConversation` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.UserConversationUpdateSchema = exports.UserConversationUpdateScalarSchema.merge(fkSchema.partial());
