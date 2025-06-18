import { z } from 'zod';
/**
 * `EmailOtp` schema excluding foreign keys and relations.
 */
export declare const EmailOtpScalarSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    otp: z.ZodString;
    expiresAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    email: string;
    otp: string;
    expiresAt: Date;
}, {
    id: string;
    email: string;
    otp: string;
    expiresAt: Date;
}>;
/**
 * `EmailOtp` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const EmailOtpSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    otp: z.ZodString;
    expiresAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    email: string;
    otp: string;
    expiresAt: Date;
}, {
    id: string;
    email: string;
    otp: string;
    expiresAt: Date;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const EmailOtpPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const EmailOtpPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `EmailOtp` schema for create operations excluding foreign keys and relations.
 */
export declare const EmailOtpCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodString;
    otp: z.ZodString;
    expiresAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    email: string;
    otp: string;
    expiresAt: Date;
    id?: string | undefined;
}, {
    email: string;
    otp: string;
    expiresAt: Date;
    id?: string | undefined;
}>;
/**
 * `EmailOtp` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const EmailOtpCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodString;
    otp: z.ZodString;
    expiresAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    email: string;
    otp: string;
    expiresAt: Date;
    id?: string | undefined;
}, {
    email: string;
    otp: string;
    expiresAt: Date;
    id?: string | undefined;
}>;
/**
 * `EmailOtp` schema for update operations excluding foreign keys and relations.
 */
export declare const EmailOtpUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    email?: string | undefined;
    otp?: string | undefined;
    expiresAt?: Date | undefined;
}, {
    id?: string | undefined;
    email?: string | undefined;
    otp?: string | undefined;
    expiresAt?: Date | undefined;
}>;
/**
 * `EmailOtp` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const EmailOtpUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    otp: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    email?: string | undefined;
    otp?: string | undefined;
    expiresAt?: Date | undefined;
}, {
    id?: string | undefined;
    email?: string | undefined;
    otp?: string | undefined;
    expiresAt?: Date | undefined;
}>;
