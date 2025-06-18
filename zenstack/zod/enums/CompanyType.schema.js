"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyTypeSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.CompanyTypeSchema = zod_1.z.enum(["seller", "buyer"]);
