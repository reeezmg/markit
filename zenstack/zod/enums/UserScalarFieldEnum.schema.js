"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.UserScalarFieldEnumSchema = zod_1.z.enum(["id", "email", "name", "password", "status", "role", "image"]);
