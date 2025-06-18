"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductinputScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ProductinputScalarFieldEnumSchema = zod_1.z.enum(["id", "name", "brand", "category", "subcategory", "description", "companyId"]);
