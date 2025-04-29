import { z } from 'zod';
/**
 * `Message` schema excluding foreign keys and relations.
 */
export declare const MessageScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    senderId: z.ZodString;
    text: z.ZodString;
    seen: z.ZodArray<z.ZodString, "many">;
    replyto: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    edited: z.ZodDefault<z.ZodBoolean>;
    deleted: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
    senderId: string;
    text: string;
    seen: string[];
    edited: boolean;
    replyto?: string | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    senderId: string;
    text: string;
    seen: string[];
    createdAt?: Date | undefined;
    deleted?: boolean | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}>;
/**
 * `Message` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const MessageSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    senderId: z.ZodString;
    text: z.ZodString;
    seen: z.ZodArray<z.ZodString, "many">;
    replyto: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    edited: z.ZodDefault<z.ZodBoolean>;
    deleted: z.ZodDefault<z.ZodBoolean>;
} & {
    conversationId: z.ZodString;
} & {
    conversation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
    conversationId: string;
    senderId: string;
    text: string;
    seen: string[];
    edited: boolean;
    conversation?: Record<string, unknown> | undefined;
    replyto?: string | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    conversationId: string;
    senderId: string;
    text: string;
    seen: string[];
    createdAt?: Date | undefined;
    deleted?: boolean | undefined;
    conversation?: Record<string, unknown> | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const MessagePrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const MessagePrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Message` schema for create operations excluding foreign keys and relations.
 */
export declare const MessageCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    senderId: z.ZodString;
    text: z.ZodString;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    senderId: string;
    text: string;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}, {
    senderId: string;
    text: string;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}>;
/**
 * `Message` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const MessageCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    senderId: z.ZodString;
    text: z.ZodString;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    conversationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    conversationId: string;
    senderId: string;
    text: string;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}, {
    conversationId: string;
    senderId: string;
    text: string;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}>;
/**
 * `Message` schema for update operations excluding foreign keys and relations.
 */
export declare const MessageUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    senderId?: string | undefined;
    text?: string | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    senderId?: string | undefined;
    text?: string | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}>;
/**
 * `Message` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const MessageUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    senderId: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    seen: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    replyto: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    edited: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    deleted: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    conversationId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    conversationId?: string | undefined;
    senderId?: string | undefined;
    text?: string | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    deleted?: boolean | undefined;
    conversationId?: string | undefined;
    senderId?: string | undefined;
    text?: string | undefined;
    seen?: string[] | undefined;
    replyto?: string | null | undefined;
    edited?: boolean | undefined;
}>;
