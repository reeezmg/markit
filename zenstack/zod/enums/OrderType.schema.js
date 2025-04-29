"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderTypeSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.OrderTypeSchema = zod_1.z.enum(["STANDARD", "BOOKING", "TRY_AT_HOME", "BILL"]);
