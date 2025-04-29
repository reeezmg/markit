"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VariantScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.VariantScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "updatedAt", "name", "code", "status", "sprice", "pprice", "qty", "discount", "dprice", "sizes", "images", "tax", "productId", "companyId"]);
