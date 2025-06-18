"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentStatusSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PaymentStatusSchema = zod_1.z.enum(["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED", "FAILED"]);
