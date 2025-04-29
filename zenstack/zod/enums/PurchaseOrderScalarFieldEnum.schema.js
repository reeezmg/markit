"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrderScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PurchaseOrderScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "updatedAt", "distributorId", "paymentType", "companyId"]);
