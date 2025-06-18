"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VariantinputScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.VariantinputScalarFieldEnumSchema = zod_1.z.enum(["id", "name", "code", "sprice", "pprice", "dprice", "discount", "qty", "sizes", "images", "companyId"]);
