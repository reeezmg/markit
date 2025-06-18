"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientPromoCodeScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ClientPromoCodeScalarFieldEnumSchema = zod_1.z.enum(["id", "clientId", "promoCodeId", "usedAt"]);
