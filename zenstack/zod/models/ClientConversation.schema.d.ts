import { z } from 'zod';
/**
 * `ClientConversation` schema excluding foreign keys and relations.
 */
export declare const ClientConversationScalarSchema: z.ZodObject<{
    clientId: z.ZodString;
    conversationId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    clientId: string;
    conversationId: string;
}, {
    clientId: string;
    conversationId: string;
}>;
/**
 * `ClientConversation` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ClientConversationSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    conversationId: z.ZodString;
} & {
    client: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    conversation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    conversationId: string;
    client?: Record<string, unknown> | undefined;
    conversation?: Record<string, unknown> | undefined;
}, {
    clientId: string;
    conversationId: string;
    client?: Record<string, unknown> | undefined;
    conversation?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ClientConversationPrismaCreateSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ClientConversationPrismaUpdateSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `ClientConversation` schema for create operations excluding foreign keys and relations.
 */
export declare const ClientConversationCreateScalarSchema: z.ZodObject<{
    clientId: z.ZodString;
    conversationId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    clientId: string;
    conversationId: string;
}, {
    clientId: string;
    conversationId: string;
}>;
/**
 * `ClientConversation` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ClientConversationCreateSchema: z.ZodObject<{} & {
    clientId: z.ZodString;
    conversationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    conversationId: string;
}, {
    clientId: string;
    conversationId: string;
}>;
/**
 * `ClientConversation` schema for update operations excluding foreign keys and relations.
 */
export declare const ClientConversationUpdateScalarSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    clientId?: string | undefined;
    conversationId?: string | undefined;
}, {
    clientId?: string | undefined;
    conversationId?: string | undefined;
}>;
/**
 * `ClientConversation` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ClientConversationUpdateSchema: z.ZodObject<{} & {
    clientId: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    clientId?: string | undefined;
    conversationId?: string | undefined;
}, {
    clientId?: string | undefined;
    conversationId?: string | undefined;
}>;
