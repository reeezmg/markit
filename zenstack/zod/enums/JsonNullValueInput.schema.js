"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonNullValueInputSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.JsonNullValueInputSchema = zod_1.z.enum(["JsonNull"]);
