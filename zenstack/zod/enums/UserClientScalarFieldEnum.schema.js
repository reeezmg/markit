"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserClientScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.UserClientScalarFieldEnumSchema = zod_1.z.enum(["clientId", "userId"]);
