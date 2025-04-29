"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.PipelineScalarFieldEnumSchema = zod_1.z.enum(["id", "companyId"]);
