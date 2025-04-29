"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.CategoryScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "updatedAt", "name", "description", "status", "image", "companyId", "hsn", "taxType", "fixedTax", "thresholdAmount", "taxBelowThreshold", "taxAboveThreshold"]);
