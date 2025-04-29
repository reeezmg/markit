"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientConversationUpdateSchema = exports.ClientConversationUpdateScalarSchema = exports.ClientConversationCreateSchema = exports.ClientConversationCreateScalarSchema = exports.ClientConversationPrismaUpdateSchema = exports.ClientConversationPrismaCreateSchema = exports.ClientConversationSchema = exports.ClientConversationScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const baseSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    conversationId: zod_1.z.string(),
}).strict();
const relationSchema = zod_1.z.object({
    client: zod_1.z.record(zod_1.z.unknown()),
    conversation: zod_1.z.record(zod_1.z.unknown()),
});
const fkSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    conversationId: zod_1.z.string(),
});
/**
 * `ClientConversation` schema excluding foreign keys and relations.
 */
exports.ClientConversationScalarSchema = baseSchema;
/**
 * `ClientConversation` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.ClientConversationSchema = exports.ClientConversationScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.ClientConversationPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.ClientConversationPrismaUpdateSchema = zod_1.z.object({
    clientId: zod_1.z.string(),
    conversationId: zod_1.z.string()
}).partial().passthrough();
/**
 * `ClientConversation` schema for create operations excluding foreign keys and relations.
 */
exports.ClientConversationCreateScalarSchema = baseSchema;
/**
 * `ClientConversation` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.ClientConversationCreateSchema = exports.ClientConversationCreateScalarSchema.merge(fkSchema);
/**
 * `ClientConversation` schema for update operations excluding foreign keys and relations.
 */
exports.ClientConversationUpdateScalarSchema = baseSchema.partial();
/**
 * `ClientConversation` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.ClientConversationUpdateSchema = exports.ClientConversationUpdateScalarSchema.merge(fkSchema.partial());
