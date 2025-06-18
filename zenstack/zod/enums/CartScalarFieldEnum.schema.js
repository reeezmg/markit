"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.CartScalarFieldEnumSchema = zod_1.z.enum(["id", "items", "createdAt", "updatedAt"]);
