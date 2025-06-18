"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillHistoryScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.BillHistoryScalarFieldEnumSchema = zod_1.z.enum(["id", "data", "changedAt", "operation", "billId"]);
