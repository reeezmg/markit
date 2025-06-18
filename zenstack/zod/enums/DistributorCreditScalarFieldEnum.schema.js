"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributorCreditScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.DistributorCreditScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "amount", "remarks", "billNo", "distributorId", "companyId"]);
