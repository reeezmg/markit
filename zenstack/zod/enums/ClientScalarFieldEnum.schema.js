"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.ClientScalarFieldEnumSchema = zod_1.z.enum(["id", "email", "name", "password", "phone", "status", "pipelineStatus", "newPipelineId", "prospectPipelineId", "viewingPipelineId", "rejectPipelineId", "closePipelineId"]);
