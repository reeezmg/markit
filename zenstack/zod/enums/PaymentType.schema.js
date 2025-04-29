"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentTypeSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PaymentTypeSchema = zod_1.z.enum(["Credit", "Cash"]);
