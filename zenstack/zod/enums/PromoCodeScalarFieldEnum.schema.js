"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoCodeScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PromoCodeScalarFieldEnumSchema = zod_1.z.enum(["id", "code", "discountPercent", "minAmount", "expiresAt", "isActive", "companyId", "usageLimit", "usageCount"]);
