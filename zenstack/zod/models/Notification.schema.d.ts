import { z } from 'zod';
/**
 * `Notification` schema excluding foreign keys and relations.
 */
export declare const NotificationScalarSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>;
    title: z.ZodString;
    message: z.ZodString;
    read: z.ZodDefault<z.ZodBoolean>;
    actionPath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    id: string;
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    read: boolean;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    message: string;
    actionPath?: string | null | undefined;
    metadata?: any;
}, {
    id: string;
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    updatedAt: Date;
    title: string;
    message: string;
    read?: boolean | undefined;
    createdAt?: Date | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}>;
/**
 * `Notification` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const NotificationSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>;
    title: z.ZodString;
    message: z.ZodString;
    read: z.ZodDefault<z.ZodBoolean>;
    actionPath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
} & {
    companyId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    user: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    client: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    read: boolean;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    message: string;
    company?: Record<string, unknown> | undefined;
    user?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    clientId?: string | null | undefined;
    userId?: string | null | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}, {
    id: string;
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    companyId: string;
    updatedAt: Date;
    title: string;
    message: string;
    company?: Record<string, unknown> | undefined;
    read?: boolean | undefined;
    user?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    createdAt?: Date | undefined;
    clientId?: string | null | undefined;
    userId?: string | null | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const NotificationPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const NotificationPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Notification` schema for create operations excluding foreign keys and relations.
 */
export declare const NotificationCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    title: z.ZodString;
    message: z.ZodString;
    actionPath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
}, "strict", z.ZodTypeAny, {
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    title: string;
    message: string;
    id?: string | undefined;
    read?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}, {
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    title: string;
    message: string;
    id?: string | undefined;
    read?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}>;
/**
 * `Notification` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const NotificationCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    title: z.ZodString;
    message: z.ZodString;
    actionPath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodAny>>;
} & {
    companyId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    companyId: string;
    title: string;
    message: string;
    id?: string | undefined;
    read?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    clientId?: string | null | undefined;
    userId?: string | null | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}, {
    type: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT";
    companyId: string;
    title: string;
    message: string;
    id?: string | undefined;
    read?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    clientId?: string | null | undefined;
    userId?: string | null | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}>;
/**
 * `Notification` schema for update operations excluding foreign keys and relations.
 */
export declare const NotificationUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    type?: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT" | undefined;
    read?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    title?: string | undefined;
    message?: string | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}, {
    id?: string | undefined;
    type?: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT" | undefined;
    read?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    title?: string | undefined;
    message?: string | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}>;
/**
 * `Notification` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const NotificationUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    read: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    actionPath: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodAny>>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    clientId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    type?: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT" | undefined;
    read?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    clientId?: string | null | undefined;
    userId?: string | null | undefined;
    title?: string | undefined;
    message?: string | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}, {
    id?: string | undefined;
    type?: "ORDER_RECEIVED" | "BILL_CREATED" | "PAYMENT_RECEIVED" | "EXPENSE_CREATED" | "INVENTORY_LOW" | "SHIPMENT_SENT" | "SYSTEM_ALERT" | undefined;
    read?: boolean | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    clientId?: string | null | undefined;
    userId?: string | null | undefined;
    title?: string | undefined;
    message?: string | undefined;
    actionPath?: string | null | undefined;
    metadata?: any;
}>;
