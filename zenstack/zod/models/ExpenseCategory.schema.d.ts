import { z } from 'zod';
/**
 * `ExpenseCategory` schema excluding foreign keys and relations.
 */
export declare const ExpenseCategoryScalarSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    status: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
}, {
    id: string;
    name: string;
    updatedAt: Date;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
}>;
/**
 * `ExpenseCategory` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const ExpenseCategorySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    status: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
} & {
    companyId: z.ZodString;
} & {
    expenses: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
    company?: Record<string, unknown> | undefined;
    expenses?: unknown[] | undefined;
}, {
    id: string;
    name: string;
    companyId: string;
    updatedAt: Date;
    company?: Record<string, unknown> | undefined;
    expenses?: unknown[] | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const ExpenseCategoryPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const ExpenseCategoryPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `ExpenseCategory` schema for create operations excluding foreign keys and relations.
 */
export declare const ExpenseCategoryCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    name: string;
    id?: string | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
/**
 * `ExpenseCategory` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const ExpenseCategoryCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    companyId: string;
    id?: string | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    name: string;
    companyId: string;
    id?: string | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
/**
 * `ExpenseCategory` schema for update operations excluding foreign keys and relations.
 */
export declare const ExpenseCategoryUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
/**
 * `ExpenseCategory` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const ExpenseCategoryUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    status?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}>;
