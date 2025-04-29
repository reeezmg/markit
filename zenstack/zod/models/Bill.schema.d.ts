import { z } from 'zod';
/**
 * `Bill` schema excluding foreign keys and relations.
 */
export declare const BillScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    invoiceNumber: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    subtotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    grandTotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    deliveryFees: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    paymentMethod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    paymentStatus: z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>;
    transactionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>;
    deleted: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    bookingDate: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    returnDeadline: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    paymentStatus: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED";
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    paymentStatus: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED";
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
}>;
/**
 * `Bill` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const BillSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    invoiceNumber: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    subtotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    grandTotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    deliveryFees: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    paymentMethod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    paymentStatus: z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>;
    transactionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>;
    deleted: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    bookingDate: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    returnDeadline: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companyId: z.ZodString;
    accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    addressId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    entries: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
    company: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    account: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    client: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    companyId: string;
    createdAt: Date;
    paymentStatus: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED";
    company?: Record<string, unknown> | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    address?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    entries?: unknown[] | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
    account?: Record<string, unknown> | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    addressId?: string | null | undefined;
}, {
    id: string;
    companyId: string;
    createdAt: Date;
    paymentStatus: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED";
    company?: Record<string, unknown> | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    address?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    entries?: unknown[] | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
    account?: Record<string, unknown> | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    addressId?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const BillPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    subtotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    grandTotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    deliveryFees: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    subtotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    grandTotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    deliveryFees: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    subtotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    grandTotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    deliveryFees: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const BillPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    subtotal: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    grandTotal: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    deliveryFees: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    subtotal: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    grandTotal: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    deliveryFees: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    subtotal: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    discount: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    tax: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    grandTotal: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    deliveryFees: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Bill` schema for create operations excluding foreign keys and relations.
 */
export declare const BillCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>;
    type: z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>;
    createdAt: z.ZodDate;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    invoiceNumber: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    subtotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    grandTotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    deliveryFees: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    paymentMethod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    returnDeadline: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    createdAt: Date;
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
}, {
    createdAt: Date;
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
}>;
/**
 * `Bill` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const BillCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>;
    type: z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>;
    createdAt: z.ZodDate;
    discount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tax: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    invoiceNumber: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    subtotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    grandTotal: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    deliveryFees: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    paymentMethod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    returnDeadline: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    companyId: z.ZodString;
    accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    addressId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    companyId: string;
    createdAt: Date;
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    addressId?: string | null | undefined;
}, {
    companyId: string;
    createdAt: Date;
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    addressId?: string | null | undefined;
}>;
/**
 * `Bill` schema for update operations excluding foreign keys and relations.
 */
export declare const BillUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    subtotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    grandTotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    deliveryFees: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    createdAt?: Date | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
}, {
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    createdAt?: Date | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
}>;
/**
 * `Bill` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const BillUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDate>;
    invoiceNumber: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    subtotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    discount: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    tax: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    grandTotal: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    deliveryFees: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]>>;
    transactionId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    type: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]>>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>>>>;
    deleted: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>>;
    bookingDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    returnDeadline: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
} & {
    companyId: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    clientId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    addressId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    addressId?: string | null | undefined;
}, {
    id?: string | undefined;
    status?: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED" | "CANCELED" | "OUTOFSTOCK" | "BOOKED" | null | undefined;
    type?: "STANDARD" | "BOOKING" | "TRY_AT_HOME" | "BILL" | null | undefined;
    companyId?: string | undefined;
    createdAt?: Date | undefined;
    discount?: number | null | undefined;
    tax?: number | null | undefined;
    invoiceNumber?: number | null | undefined;
    subtotal?: number | null | undefined;
    grandTotal?: number | null | undefined;
    deliveryFees?: number | null | undefined;
    paymentMethod?: string | null | undefined;
    paymentStatus?: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "COMPLETED" | "FAILED" | undefined;
    transactionId?: string | null | undefined;
    notes?: string | null | undefined;
    deleted?: boolean | null | undefined;
    bookingDate?: Date | null | undefined;
    returnDeadline?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    addressId?: string | null | undefined;
}>;
