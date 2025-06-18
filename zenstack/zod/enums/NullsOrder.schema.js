"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullsOrderSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.NullsOrderSchema = zod_1.z.enum(["first", "last"]);
