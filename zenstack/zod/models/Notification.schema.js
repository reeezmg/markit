"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationUpdateSchema = exports.NotificationUpdateScalarSchema = exports.NotificationCreateSchema = exports.NotificationCreateScalarSchema = exports.NotificationPrismaUpdateSchema = exports.NotificationPrismaCreateSchema = exports.NotificationSchema = exports.NotificationScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const NotificationType_schema_1 = require("../enums/NotificationType.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: NotificationType_schema_1.NotificationTypeSchema,
    title: zod_1.z.string(),
    message: zod_1.z.string(),
    read: zod_1.z.boolean().default(false),
    actionPath: zod_1.z.string().nullish(),
    metadata: zod_1.z.any().nullish(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date(),
}).strict();
const relationSchema = zod_1.z.object({
    company: zod_1.z.record(zod_1.z.unknown()),
    user: zod_1.z.record(zod_1.z.unknown()).optional(),
    client: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const fkSchema = zod_1.z.object({
    companyId: zod_1.z.string(),
    userId: zod_1.z.string().nullish(),
    clientId: zod_1.z.string().nullish(),
});
/**
 * `Notification` schema excluding foreign keys and relations.
 */
exports.NotificationScalarSchema = baseSchema;
/**
 * `Notification` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.NotificationSchema = exports.NotificationScalarSchema.merge(fkSchema).merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.NotificationPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.NotificationPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: NotificationType_schema_1.NotificationTypeSchema,
    title: zod_1.z.string(),
    message: zod_1.z.string(),
    read: zod_1.z.boolean().default(false),
    actionPath: zod_1.z.string().nullish(),
    metadata: zod_1.z.any().nullish(),
    createdAt: zod_1.z.coerce.date().default(() => new Date()),
    updatedAt: zod_1.z.coerce.date()
}).partial().passthrough();
/**
 * `Notification` schema for create operations excluding foreign keys and relations.
 */
exports.NotificationCreateScalarSchema = baseSchema.partial({
    id: true, read: true, createdAt: true, updatedAt: true
});
/**
 * `Notification` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.NotificationCreateSchema = exports.NotificationCreateScalarSchema.merge(fkSchema);
/**
 * `Notification` schema for update operations excluding foreign keys and relations.
 */
exports.NotificationUpdateScalarSchema = baseSchema.partial();
/**
 * `Notification` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.NotificationUpdateSchema = exports.NotificationUpdateScalarSchema.merge(fkSchema.partial());
