"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ProductScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "updatedAt", "name", "brand", "status", "rating", "description", "companyId", "categoryId", "subcategoryId", "purchaseorderId"]);
