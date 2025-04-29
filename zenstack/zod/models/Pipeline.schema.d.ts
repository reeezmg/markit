import { z } from 'zod';
/**
 * `Pipeline` schema excluding foreign keys and relations.
 */
export declare const PipelineScalarSchema: z.ZodObject<{
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
/**
 * `Pipeline` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const PipelineSchema: z.ZodObject<{
    id: z.ZodString;
} & {
    companyId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    newClients: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    prospectClients: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    viewingClients: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    rejectClients: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    closeClients: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    companyId: string;
    company?: Record<string, unknown> | undefined;
    newClients?: unknown[] | undefined;
    prospectClients?: unknown[] | undefined;
    viewingClients?: unknown[] | undefined;
    rejectClients?: unknown[] | undefined;
    closeClients?: unknown[] | undefined;
}, {
    id: string;
    companyId: string;
    company?: Record<string, unknown> | undefined;
    newClients?: unknown[] | undefined;
    prospectClients?: unknown[] | undefined;
    viewingClients?: unknown[] | undefined;
    rejectClients?: unknown[] | undefined;
    closeClients?: unknown[] | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const PipelinePrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const PipelinePrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Pipeline` schema for create operations excluding foreign keys and relations.
 */
export declare const PipelineCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
}, {
    id?: string | undefined;
}>;
/**
 * `Pipeline` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const PipelineCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id?: string | undefined;
}, {
    companyId: string;
    id?: string | undefined;
}>;
/**
 * `Pipeline` schema for update operations excluding foreign keys and relations.
 */
export declare const PipelineUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
}, {
    id?: string | undefined;
}>;
/**
 * `Pipeline` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const PipelineUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    companyId?: string | undefined;
}, {
    id?: string | undefined;
    companyId?: string | undefined;
}>;
