"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserConversationScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.UserConversationScalarFieldEnumSchema = zod_1.z.enum(["userId", "conversationId"]);
