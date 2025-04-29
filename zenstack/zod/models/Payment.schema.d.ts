import { z } from 'zod';
/**
 * `Payment` schema excluding foreign keys and relations.
 */
export declare const PaymentScalarSchema: z.ZodObject<{
    id: z.ZodString;
    paymentDate: z.ZodDefault<z.ZodDate>;
    paymentMode: z.ZodString;
    paymentReference: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    amount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    status: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    currency: string;
    paymentMode: string;
    paymentDate: Date;
    amount: number;
    paymentReference?: string | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    paymentMode: string;
    amount: number;
    status?: string | undefined;
    createdAt?: Date | undefined;
    currency?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
}>;
/**
 * `Payment` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const PaymentSchema: z.ZodObject<{
    id: z.ZodString;
    paymentDate: z.ZodDefault<z.ZodDate>;
    paymentMode: z.ZodString;
    paymentReference: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    amount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    status: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
} & {
    companyId: z.ZodString;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: string;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
    currency: string;
    paymentMode: string;
    paymentDate: Date;
    amount: number;
    company?: Record<string, unknown> | undefined;
    paymentReference?: string | null | undefined;
}, {
    id: string;
    companyId: string;
    updatedAt: Date;
    paymentMode: string;
    amount: number;
    company?: Record<string, unknown> | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    currency?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const PaymentPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const PaymentPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Payment` schema for create operations excluding foreign keys and relations.
 */
export declare const PaymentCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodString;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentReference: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    amount: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    paymentMode: string;
    amount: number;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
}, {
    paymentMode: string;
    amount: number;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
}>;
/**
 * `Payment` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const PaymentCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    paymentMode: z.ZodString;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentReference: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    amount: z.ZodNumber;
} & {
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    paymentMode: string;
    amount: number;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
}, {
    companyId: string;
    paymentMode: string;
    amount: number;
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
}>;
/**
 * `Payment` schema for update operations excluding foreign keys and relations.
 */
export declare const PaymentUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentMode?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
    amount?: number | undefined;
}, {
    id?: string | undefined;
    status?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentMode?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
    amount?: number | undefined;
}>;
/**
 * `Payment` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const PaymentUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    paymentDate: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    paymentMode: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    amount: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    status?: string | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentMode?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
    amount?: number | undefined;
}, {
    id?: string | undefined;
    status?: string | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    currency?: string | undefined;
    paymentMode?: string | undefined;
    paymentDate?: Date | undefined;
    paymentReference?: string | null | undefined;
    amount?: number | undefined;
}>;
