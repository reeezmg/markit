"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderStatusSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.OrderStatusSchema = zod_1.z.enum(["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]);
