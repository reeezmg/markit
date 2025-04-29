"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributorScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.DistributorScalarFieldEnumSchema = zod_1.z.enum(["id", "name", "images", "status", "accHolderName", "ifsc", "accountNo", "bankName", "gstin"]);
