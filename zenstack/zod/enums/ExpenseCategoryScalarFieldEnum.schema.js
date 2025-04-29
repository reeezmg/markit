"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseCategoryScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ExpenseCategoryScalarFieldEnumSchema = zod_1.z.enum(["id", "name", "status", "createdAt", "updatedAt", "companyId"]);
