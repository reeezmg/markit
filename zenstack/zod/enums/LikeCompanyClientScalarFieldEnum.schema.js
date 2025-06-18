"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LikeCompanyClientScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.LikeCompanyClientScalarFieldEnumSchema = zod_1.z.enum(["clientId", "companyId", "likeId"]);
