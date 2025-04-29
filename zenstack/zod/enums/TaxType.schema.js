"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxTypeSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.TaxTypeSchema = zod_1.z.enum(["FIXED", "VARIABLE"]);
