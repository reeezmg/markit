"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.BillScalarFieldEnumSchema = zod_1.z.enum(["id", "createdAt", "invoiceNumber", "subtotal", "discount", "tax", "grandTotal", "deliveryFees", "paymentMethod", "paymentStatus", "transactionId", "notes", "type", "status", "deleted", "bookingDate", "returnDeadline", "companyId", "accountId", "clientId", "addressId"]);
