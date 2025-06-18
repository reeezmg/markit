"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyUserScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.CompanyUserScalarFieldEnumSchema = zod_1.z.enum(["companyId", "userId"]);
