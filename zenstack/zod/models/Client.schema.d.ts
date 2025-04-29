import { z } from 'zod';
/**
 * `Client` schema excluding foreign keys and relations.
 */
export declare const ClientScalarSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodString;
    status: z.ZodDefault<z.ZodBoolean>;
    pipelineStatus: z.ZodDefault<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    phone: string;
    pipelineStatus: string;
    email?: string | null | undefined;
    password?: string | null | undefined;
}, {
    id: string;
    name: string;
    phone: string;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    pipelineStatus?: string | undefined;
}>;
/**
 * `Client` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ClientSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodString;
    status: z.ZodDefault<z.ZodBoolean>;
    pipelineStatus: z.ZodDefault<z.ZodString>;
} & {
    newPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    prospectPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    viewingPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rejectPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    closePipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companies: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    bill: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    conversations: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    users: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    newPipeline: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    prospectPipeline: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    viewingPipeline: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    rejectPipeline: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    closePipeline: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    notifications: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    phone: string;
    pipelineStatus: string;
    users?: unknown[] | undefined;
    notifications?: unknown[] | undefined;
    address?: unknown[] | undefined;
    companies?: unknown[] | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    conversations?: unknown[] | undefined;
    bill?: Record<string, unknown> | undefined;
    newPipeline?: Record<string, unknown> | undefined;
    newPipelineId?: string | null | undefined;
    prospectPipeline?: Record<string, unknown> | undefined;
    prospectPipelineId?: string | null | undefined;
    viewingPipeline?: Record<string, unknown> | undefined;
    viewingPipelineId?: string | null | undefined;
    rejectPipeline?: Record<string, unknown> | undefined;
    rejectPipelineId?: string | null | undefined;
    closePipeline?: Record<string, unknown> | undefined;
    closePipelineId?: string | null | undefined;
}, {
    id: string;
    name: string;
    phone: string;
    users?: unknown[] | undefined;
    status?: boolean | undefined;
    notifications?: unknown[] | undefined;
    address?: unknown[] | undefined;
    companies?: unknown[] | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    conversations?: unknown[] | undefined;
    pipelineStatus?: string | undefined;
    bill?: Record<string, unknown> | undefined;
    newPipeline?: Record<string, unknown> | undefined;
    newPipelineId?: string | null | undefined;
    prospectPipeline?: Record<string, unknown> | undefined;
    prospectPipelineId?: string | null | undefined;
    viewingPipeline?: Record<string, unknown> | undefined;
    viewingPipelineId?: string | null | undefined;
    rejectPipeline?: Record<string, unknown> | undefined;
    rejectPipelineId?: string | null | undefined;
    closePipeline?: Record<string, unknown> | undefined;
    closePipelineId?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ClientPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ClientPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Client` schema for create operations excluding foreign keys and relations.
 */
export declare const ClientCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodString;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    phone: string;
    id?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    pipelineStatus?: string | undefined;
}, {
    name: string;
    phone: string;
    id?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    pipelineStatus?: string | undefined;
}>;
/**
 * `Client` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ClientCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodString;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
} & {
    newPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    prospectPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    viewingPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rejectPipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    closePipelineId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    phone: string;
    id?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    pipelineStatus?: string | undefined;
    newPipelineId?: string | null | undefined;
    prospectPipelineId?: string | null | undefined;
    viewingPipelineId?: string | null | undefined;
    rejectPipelineId?: string | null | undefined;
    closePipelineId?: string | null | undefined;
}, {
    name: string;
    phone: string;
    id?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    pipelineStatus?: string | undefined;
    newPipelineId?: string | null | undefined;
    prospectPipelineId?: string | null | undefined;
    viewingPipelineId?: string | null | undefined;
    rejectPipelineId?: string | null | undefined;
    closePipelineId?: string | null | undefined;
}>;
/**
 * `Client` schema for update operations excluding foreign keys and relations.
 */
export declare const ClientUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    phone?: string | undefined;
    pipelineStatus?: string | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    phone?: string | undefined;
    pipelineStatus?: string | undefined;
}>;
/**
 * `Client` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ClientUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    phone: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    pipelineStatus: z.ZodOptional<z.ZodDefault<z.ZodString>>;
} & {
    newPipelineId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    prospectPipelineId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    viewingPipelineId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    rejectPipelineId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    closePipelineId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    phone?: string | undefined;
    pipelineStatus?: string | undefined;
    newPipelineId?: string | null | undefined;
    prospectPipelineId?: string | null | undefined;
    viewingPipelineId?: string | null | undefined;
    rejectPipelineId?: string | null | undefined;
    closePipelineId?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    email?: string | null | undefined;
    password?: string | null | undefined;
    phone?: string | undefined;
    pipelineStatus?: string | undefined;
    newPipelineId?: string | null | undefined;
    prospectPipelineId?: string | null | undefined;
    viewingPipelineId?: string | null | undefined;
    rejectPipelineId?: string | null | undefined;
    closePipelineId?: string | null | undefined;
}>;
