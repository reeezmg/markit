"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayableStatusSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PayableStatusSchema = zod_1.z.enum(["PENDING", "PARTIALLY_PAID", "PAID", "CANCELLED"]);
