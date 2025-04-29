"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubcategoryScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.SubcategoryScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "updatedAt", "name", "description", "status", "image", "companyId", "categoryId"]);
