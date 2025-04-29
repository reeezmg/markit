"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ExpenseScalarFieldEnumSchema = zod_1.z.enum(["id", "expenseDate", "note", "currency", "paymentMode", "status", "receipt", "receiptName", "taxAmount", "totalAmount", "createdAt", "updatedAt", "expensecategoryId", "companyId"]);
