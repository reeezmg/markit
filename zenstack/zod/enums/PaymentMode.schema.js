"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentModeSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PaymentModeSchema = zod_1.z.enum(["CASH", "CARD", "BANK_TRANSFER", "UPI"]);
