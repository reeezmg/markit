import { z } from 'zod';
/**
 * `Address` schema excluding foreign keys and relations.
 */
export declare const AddressScalarSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    street: z.ZodString;
    locality: z.ZodString;
    city: z.ZodString;
    state: z.ZodString;
    pincode: z.ZodString;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    active: boolean;
    name?: string | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    name?: string | null | undefined;
    createdAt?: Date | undefined;
    active?: boolean | undefined;
}>;
/**
 * `Address` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export declare const AddressSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDefault<z.ZodDate>;
    updatedAt: z.ZodDate;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    street: z.ZodString;
    locality: z.ZodString;
    city: z.ZodString;
    state: z.ZodString;
    pincode: z.ZodString;
    active: z.ZodDefault<z.ZodBoolean>;
} & {
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    distributorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    companyId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    user: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    client: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    distributor: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    company: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    account: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    bill: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    active: boolean;
    name?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    distributor?: Record<string, unknown> | undefined;
    user?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    bill?: unknown[] | undefined;
    companyId?: string | null | undefined;
    distributorId?: string | null | undefined;
    account?: Record<string, unknown> | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    userId?: string | null | undefined;
}, {
    id: string;
    updatedAt: Date;
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    name?: string | null | undefined;
    company?: Record<string, unknown> | undefined;
    distributor?: Record<string, unknown> | undefined;
    user?: Record<string, unknown> | undefined;
    client?: Record<string, unknown> | undefined;
    bill?: unknown[] | undefined;
    companyId?: string | null | undefined;
    createdAt?: Date | undefined;
    distributorId?: string | null | undefined;
    account?: Record<string, unknown> | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    active?: boolean | undefined;
    userId?: string | null | undefined;
}>;
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export declare const AddressPrismaCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export declare const AddressPrismaUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * `Address` schema for create operations excluding foreign keys and relations.
 */
export declare const AddressCreateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    street: z.ZodString;
    locality: z.ZodString;
    city: z.ZodString;
    state: z.ZodString;
    pincode: z.ZodString;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    id?: string | undefined;
    name?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    active?: boolean | undefined;
}, {
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    id?: string | undefined;
    name?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    active?: boolean | undefined;
}>;
/**
 * `Address` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export declare const AddressCreateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    street: z.ZodString;
    locality: z.ZodString;
    city: z.ZodString;
    state: z.ZodString;
    pincode: z.ZodString;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    distributorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    companyId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    id?: string | undefined;
    name?: string | null | undefined;
    companyId?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    active?: boolean | undefined;
    userId?: string | null | undefined;
}, {
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    id?: string | undefined;
    name?: string | null | undefined;
    companyId?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    active?: boolean | undefined;
    userId?: string | null | undefined;
}>;
/**
 * `Address` schema for update operations excluding foreign keys and relations.
 */
export declare const AddressUpdateScalarSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    street?: string | undefined;
    locality?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    pincode?: string | undefined;
    active?: boolean | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    street?: string | undefined;
    locality?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    pincode?: string | undefined;
    active?: boolean | undefined;
}>;
/**
 * `Address` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export declare const AddressUpdateSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodDefault<z.ZodDate>>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    name: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    street: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    pincode: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    userId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    clientId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    distributorId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    companyId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    accountId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    name?: string | null | undefined;
    companyId?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    street?: string | undefined;
    locality?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    pincode?: string | undefined;
    active?: boolean | undefined;
    userId?: string | null | undefined;
}, {
    id?: string | undefined;
    name?: string | null | undefined;
    companyId?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    distributorId?: string | null | undefined;
    accountId?: string | null | undefined;
    clientId?: string | null | undefined;
    street?: string | undefined;
    locality?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    pincode?: string | undefined;
    active?: boolean | undefined;
    userId?: string | null | undefined;
}>;
