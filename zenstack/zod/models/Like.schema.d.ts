import { z } from 'zod';
/**
 * `Like` schema excluding foreign keys and relations.
 */
export declare const LikeScalarSchema: z.ZodObject<{
    id: z.ZodString;
    variantIds: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    variantIds: string[];
}, {
    id: string;
    updatedAt: Date;
    variantIds: string[];
    createdAt?: Date | undefined;
}>;
/**
 * `Like` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const LikeSchema: z.ZodObject<{
    id: z.ZodString;
    variantIds: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
} & {
    clientCompany: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    variantIds: string[];
    clientCompany?: Record<string, unknown> | undefined;
}, {
    id: string;
    updatedAt: Date;
    variantIds: string[];
    createdAt?: Date | undefined;
    clientCompany?: Record<string, unknown> | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const LikePrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const LikePrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Like` schema for create operations excluding foreign keys and relations.
 */
export declare const LikeCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}>;
/**
 * `Like` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const LikeCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}>;
/**
 * `Like` schema for update operations excluding foreign keys and relations.
 */
export declare const LikeUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}>;
/**
 * `Like` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const LikeUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    variantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    variantIds?: string[] | undefined;
}>;
