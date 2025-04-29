"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailOtpScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.EmailOtpScalarFieldEnumSchema = zod_1.z.enum(["id", "email", "otp", "expiresAt"]);
