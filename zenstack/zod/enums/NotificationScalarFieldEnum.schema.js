"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.NotificationScalarFieldEnumSchema = zod_1.z.enum(["id", "companyId", "userId", "clientId", "type", "title", "message", "read", "actionPath", "metadata", "createdAt", "updatedAt"]);
