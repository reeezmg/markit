"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationTypeSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.NotificationTypeSchema = zod_1.z.enum(["ORDER_RECEIVED", "BILL_CREATED", "PAYMENT_RECEIVED", "EXPENSE_CREATED", "INVENTORY_LOW", "SHIPMENT_SENT", "SYSTEM_ALERT"]);
