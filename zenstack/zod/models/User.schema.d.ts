import { z } from 'zod';
/**
 * `User` schema excluding foreign keys and relations.
 */
export declare const UserScalarSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    password: z.ZodString;
    status: z.ZodDefault<z.ZodBoolean>;
    role: z.ZodEnum<["admin", "user"]>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    status: boolean;
    email: string;
    password: string;
    role: "user" | "admin";
    name?: string | null | undefined;
    image?: string | null | undefined;
}, {
    id: string;
    email: string;
    password: string;
    role: "user" | "admin";
    name?: string | null | undefined;
    status?: boolean | undefined;
    image?: string | null | undefined;
}>;
/**
 * `User` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    password: z.ZodString;
    status: z.ZodDefault<z.ZodBoolean>;
    role: z.ZodEnum<["admin", "user"]>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companies: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    notifications: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    conversations: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    clients: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: boolean;
    email: string;
    password: string;
    role: "user" | "admin";
    name?: string | null | undefined;
    clients?: unknown[] | undefined;
    notifications?: unknown[] | undefined;
    address?: Record<string, unknown> | undefined;
    companies?: unknown[] | undefined;
    conversations?: unknown[] | undefined;
    image?: string | null | undefined;
}, {
    id: string;
    email: string;
    password: string;
    role: "user" | "admin";
    name?: string | null | undefined;
    clients?: unknown[] | undefined;
    status?: boolean | undefined;
    notifications?: unknown[] | undefined;
    address?: Record<string, unknown> | undefined;
    companies?: unknown[] | undefined;
    conversations?: unknown[] | undefined;
    image?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const UserPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const UserPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `User` schema for create operations excluding foreign keys and relations.
 */
export declare const UserCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}, {
    email: string;
    password: string;
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}>;
/**
 * `User` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const UserCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}, {
    email: string;
    password: string;
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}>;
/**
 * `User` schema for update operations excluding foreign keys and relations.
 */
export declare const UserUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    email?: string | undefined;
    password?: string | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    email?: string | undefined;
    password?: string | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}>;
/**
 * `User` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const UserUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    password: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    role: z.ZodOptional<z.ZodEnum<["admin", "user"]>>;
    image: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    email?: string | undefined;
    password?: string | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    status?: boolean | undefined;
    email?: string | undefined;
    password?: string | undefined;
    role?: "user" | "admin" | undefined;
    image?: string | null | undefined;
}>;
