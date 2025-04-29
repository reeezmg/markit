"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntryScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.EntryScalarFieldEnumSchema = zod_1.z.enum(["id", "name", "barcode", "qty", "rate", "discount", "tax", "value", "size", "variantId", "outOfStock", "categoryId", "billId", "itemId"]);
