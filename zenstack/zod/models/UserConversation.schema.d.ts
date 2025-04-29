import { z } from 'zod';
/**
 * `UserConversation` schema excluding foreign keys and relations.
 */
export declare const UserConversationScalarSchema: z.ZodObject<{
    userId: z.ZodString;
    conversationId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    userId: string;
    conversationId: string;
}, {
    userId: string;
    conversationId: string;
}>;
/**
 * `UserConversation` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const UserConversationSchema: z.ZodObject<{} & {
    userId: z.ZodString;
    conversationId: z.ZodString;
} & {
    user: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    conversation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    conversationId: string;
    user?: Record<string, unknown> | undefined;
    conversation?: Record<string, unknown> | undefined;
}, {
    userId: string;
    conversationId: string;
    user?: Record<string, unknown> | undefined;
    conversation?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const UserConversationPrismaCreateSchema: z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const UserConversationPrismaUpdateSchema: z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `UserConversation` schema for create operations excluding foreign keys and relations.
 */
export declare const UserConversationCreateScalarSchema: z.ZodObject<{
    userId: z.ZodString;
    conversationId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    userId: string;
    conversationId: string;
}, {
    userId: string;
    conversationId: string;
}>;
/**
 * `UserConversation` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const UserConversationCreateSchema: z.ZodObject<{} & {
    userId: z.ZodString;
    conversationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    userId: string;
    conversationId: string;
}, {
    userId: string;
    conversationId: string;
}>;
/**
 * `UserConversation` schema for update operations excluding foreign keys and relations.
 */
export declare const UserConversationUpdateScalarSchema: z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    userId?: string | undefined;
    conversationId?: string | undefined;
}, {
    userId?: string | undefined;
    conversationId?: string | undefined;
}>;
/**
 * `UserConversation` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const UserConversationUpdateSchema: z.ZodObject<{} & {
    userId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId?: string | undefined;
    conversationId?: string | undefined;
}, {
    userId?: string | undefined;
    conversationId?: string | undefined;
}>;
