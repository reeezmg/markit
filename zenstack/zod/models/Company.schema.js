"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyUpdateSchema = exports.CompanyUpdateScalarSchema = exports.CompanyCreateSchema = exports.CompanyCreateScalarSchema = exports.CompanyPrismaUpdateSchema = exports.CompanyPrismaCreateSchema = exports.CompanySchema = exports.CompanyScalarSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
const CompanyType_schema_1 = require("../enums/CompanyType.schema");
const baseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    storecode: zod_1.z.number(),
    storeUniqueName: zod_1.z.string().nullish(),
    logo: zod_1.z.string().nullish(),
    description: zod_1.z.string().nullish(),
    shopifyStoreName: zod_1.z.string().nullish(),
    shopifyAccessToken: zod_1.z.string().nullish(),
    tiktokCipher: zod_1.z.string().nullish(),
    tiktokStoreName: zod_1.z.string().nullish(),
    tiktokAccessToken: zod_1.z.string().nullish(),
    tiktokAccessTokenExpireIn: zod_1.z.number().nullish(),
    tiktokRefreshToken: zod_1.z.string().nullish(),
    tiktokRefreshTokenExpireIn: zod_1.z.number().nullish(),
    images: zod_1.z.string().nullish(),
    isTaxIncluded: zod_1.z.boolean().default(true),
    status: zod_1.z.boolean().default(true),
    type: CompanyType_schema_1.CompanyTypeSchema,
    accHolderName: zod_1.z.string().nullish(),
    ifsc: zod_1.z.string().nullish(),
    accountNo: zod_1.z.string().nullish(),
    bankName: zod_1.z.string().nullish(),
    gstin: zod_1.z.string().nullish(),
    upiId: zod_1.z.string().nullish(),
    billCounter: zod_1.z.number().default(0),
    barcodeCounter: zod_1.z.number().default(1),
}).strict();
const relationSchema = zod_1.z.object({
    users: zod_1.z.array(zod_1.z.unknown()).optional(),
    clients: zod_1.z.array(zod_1.z.unknown()).optional(),
    products: zod_1.z.array(zod_1.z.unknown()).optional(),
    categories: zod_1.z.array(zod_1.z.unknown()).optional(),
    subcategories: zod_1.z.array(zod_1.z.unknown()).optional(),
    bills: zod_1.z.array(zod_1.z.unknown()).optional(),
    tokenbills: zod_1.z.array(zod_1.z.unknown()).optional(),
    accounts: zod_1.z.array(zod_1.z.unknown()).optional(),
    expenseCategories: zod_1.z.array(zod_1.z.unknown()).optional(),
    expenses: zod_1.z.array(zod_1.z.unknown()).optional(),
    payment: zod_1.z.array(zod_1.z.unknown()).optional(),
    variants: zod_1.z.array(zod_1.z.unknown()).optional(),
    purchaseOrders: zod_1.z.array(zod_1.z.unknown()).optional(),
    items: zod_1.z.array(zod_1.z.unknown()).optional(),
    pipeline: zod_1.z.record(zod_1.z.unknown()).optional(),
    notifications: zod_1.z.array(zod_1.z.unknown()).optional(),
    address: zod_1.z.record(zod_1.z.unknown()).optional(),
    distributor: zod_1.z.array(zod_1.z.unknown()).optional(),
});
/**
 * `Company` schema excluding foreign keys and relations.
 */
exports.CompanyScalarSchema = baseSchema;
/**
 * `Company` schema including all fields (scalar, foreign key, and relations) and validations.
 */
exports.CompanySchema = exports.CompanyScalarSchema.merge(relationSchema.partial());
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
exports.CompanyPrismaCreateSchema = baseSchema.partial().passthrough();
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
exports.CompanyPrismaUpdateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    storecode: zod_1.z.union([zod_1.z.number(), zod_1.z.record(zod_1.z.unknown())]),
    storeUniqueName: zod_1.z.string().nullish(),
    logo: zod_1.z.string().nullish(),
    description: zod_1.z.string().nullish(),
    shopifyStoreName: zod_1.z.string().nullish(),
    shopifyAccessToken: zod_1.z.string().nullish(),
    tiktokCipher: zod_1.z.string().nullish(),
    tiktokStoreName: zod_1.z.string().nullish(),
    tiktokAccessToken: zod_1.z.string().nullish(),
    tiktokAccessTokenExpireIn: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    tiktokRefreshToken: zod_1.z.string().nullish(),
    tiktokRefreshTokenExpireIn: zod_1.z.union([zod_1.z.number().nullish(), zod_1.z.record(zod_1.z.unknown())]),
    images: zod_1.z.string().nullish(),
    isTaxIncluded: zod_1.z.boolean().default(true),
    status: zod_1.z.boolean().default(true),
    type: CompanyType_schema_1.CompanyTypeSchema,
    accHolderName: zod_1.z.string().nullish(),
    ifsc: zod_1.z.string().nullish(),
    accountNo: zod_1.z.string().nullish(),
    bankName: zod_1.z.string().nullish(),
    gstin: zod_1.z.string().nullish(),
    upiId: zod_1.z.string().nullish(),
    billCounter: zod_1.z.union([zod_1.z.number().default(0), zod_1.z.record(zod_1.z.unknown())]),
    barcodeCounter: zod_1.z.union([zod_1.z.number().default(1), zod_1.z.record(zod_1.z.unknown())])
}).partial().passthrough();
/**
 * `Company` schema for create operations excluding foreign keys and relations.
 */
exports.CompanyCreateScalarSchema = baseSchema.partial({
    id: true, storecode: true, isTaxIncluded: true, status: true, billCounter: true, barcodeCounter: true
});
/**
 * `Company` schema for create operations including scalar fields, foreign key fields, and validations.
 */
exports.CompanyCreateSchema = baseSchema.partial({
    id: true, storecode: true, isTaxIncluded: true, status: true, billCounter: true, barcodeCounter: true
});
/**
 * `Company` schema for update operations excluding foreign keys and relations.
 */
exports.CompanyUpdateScalarSchema = baseSchema.partial();
/**
 * `Company` schema for update operations including scalar fields, foreign key fields, and validations.
 */
exports.CompanyUpdateSchema = exports.CompanyUpdateScalarSchema;
