"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoleSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.UserRoleSchema = zod_1.z.enum(["admin", "user"]);
