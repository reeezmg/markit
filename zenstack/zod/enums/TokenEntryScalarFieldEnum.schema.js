"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenEntryScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.TokenEntryScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "tokenNo", "companyId", "itemId", "variantId", "barcode", "categoryId", "size", "name", "qty", "rate", "discount", "tax", "value", "sizes", "totalQty"]);
