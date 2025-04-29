"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VariantSizeBarcodeScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.VariantSizeBarcodeScalarFieldEnumSchema = zod_1.z.enum(["id", "variantId", "size", "barcode"]);
