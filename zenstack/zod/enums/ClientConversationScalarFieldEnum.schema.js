"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientConversationScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ClientConversationScalarFieldEnumSchema = zod_1.z.enum(["clientId", "conversationId"]);
