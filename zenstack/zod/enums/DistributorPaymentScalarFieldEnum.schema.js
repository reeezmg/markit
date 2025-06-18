"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributorPaymentScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.DistributorPaymentScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "amount", "remarks", "paymentType", "distributorId", "companyId"]);
