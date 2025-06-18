"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PaymentScalarFieldEnumSchema = zod_1.z.enum(["id", "paymentDate", "paymentMode", "paymentReference", "amount", "currency", "status", "createdAt", "updatedAt", "companyId"]);
