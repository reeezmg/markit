"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.AccountScalarFieldEnumSchema = zod_1.z.enum(["id", "name", "phone", "companyId"]);
