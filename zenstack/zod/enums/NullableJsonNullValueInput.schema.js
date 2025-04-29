"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullableJsonNullValueInputSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.NullableJsonNullValueInputSchema = zod_1.z.enum(["DbNull", "JsonNull"]);
