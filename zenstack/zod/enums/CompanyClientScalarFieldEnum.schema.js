"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyClientScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.CompanyClientScalarFieldEnumSchema = zod_1.z.enum(["companyId", "clientId"]);
