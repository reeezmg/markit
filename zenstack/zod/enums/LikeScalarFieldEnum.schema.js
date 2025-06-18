"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LikeScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.LikeScalarFieldEnumSchema = zod_1.z.enum(["id", "variantIds", "createdAt", "updatedAt"]);
