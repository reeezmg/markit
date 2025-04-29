import { z } from 'zod';
/**
 * `PurchaseOrder` schema excluding foreign keys and relations.
 */
export declare const PurchaseOrderScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    paymentType?: "Credit" | "Cash" | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    createdAt?: Date | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}>;
/**
 * `PurchaseOrder` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const PurchaseOrderSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>;
} & {
    distributorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    companyId: z.ZodString;
} & {
    products: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    distributor: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
    company?: Record<string, unknown> | undefined;
    products?: unknown[] | undefined;
    distributor?: Record<string, unknown> | undefined;
    distributorId?: string | null | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}, {
    id: string;
    companyId: string;
    updatedAt: Date;
    company?: Record<string, unknown> | undefined;
    products?: unknown[] | undefined;
    distributor?: Record<string, unknown> | undefined;
    createdAt?: Date | undefined;
    distributorId?: string | null | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const PurchaseOrderPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const PurchaseOrderPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `PurchaseOrder` schema for create operations excluding foreign keys and relations.
 */
export declare const PurchaseOrderCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}>;
/**
 * `PurchaseOrder` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const PurchaseOrderCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>;
} & {
    distributorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}, {
    companyId: string;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}>;
/**
 * `PurchaseOrder` schema for update operations excluding foreign keys and relations.
 */
export declare const PurchaseOrderUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}, {
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}>;
/**
 * `PurchaseOrder` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const PurchaseOrderUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    paymentType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["Credit", "Cash"]>>>>;
} & {
    distributorId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    companyId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}, {
    id?: string | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    paymentType?: "Credit" | "Cash" | null | undefined;
}>;
