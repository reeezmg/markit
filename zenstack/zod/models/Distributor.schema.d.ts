import { z } from 'zod';
/**
 * `Distributor` schema excluding foreign keys and relations.
 */
export declare const DistributorScalarSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    accHolderName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ifsc: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    gstin: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    images?: string | null | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}, {
    id: string;
    name: string;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}>;
/**
 * `Distributor` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const DistributorSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodBoolean>;
    accHolderName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ifsc: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    gstin: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companies: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    purchaseorders: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: boolean;
    images?: string | null | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
    address?: Record<string, unknown> | undefined;
    companies?: unknown[] | undefined;
    purchaseorders?: unknown[] | undefined;
}, {
    id: string;
    name: string;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
    address?: Record<string, unknown> | undefined;
    companies?: unknown[] | undefined;
    purchaseorders?: unknown[] | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const DistributorPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const DistributorPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Distributor` schema for create operations excluding foreign keys and relations.
 */
export declare const DistributorCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ifsc: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    gstin: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}, {
    name: string;
    id?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}>;
/**
 * `Distributor` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    images: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ifsc: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    gstin: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    id?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}, {
    name: string;
    id?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}>;
/**
 * `Distributor` schema for update operations excluding foreign keys and relations.
 */
export declare const DistributorUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}>;
/**
 * `Distributor` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const DistributorUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    accHolderName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    ifsc: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bankName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | undefined;
    images?: string | null | undefined;
    status?: boolean | undefined;
    accHolderName?: string | null | undefined;
    ifsc?: string | null | undefined;
    accountNo?: string | null | undefined;
    bankName?: string | null | undefined;
    gstin?: string | null | undefined;
}>;
