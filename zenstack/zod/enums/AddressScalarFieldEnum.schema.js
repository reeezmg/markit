"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.AddressScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "updatedAt", "name", "street", "locality", "city", "state", "pincode", "active", "userId", "clientId", "distributorId", "companyId", "accountId"]);
