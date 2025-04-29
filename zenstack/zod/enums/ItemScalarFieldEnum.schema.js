"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ItemScalarFieldEnumSchema = zod_1.z.enum(["id", "barcode", "createdAt", "updatedAt", "variantId", "status", "size", "companyId"]);
