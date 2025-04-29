"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyScalarFieldEnumSchema = void 0;
// @ts-nocheck
const zod_1 = require("zod");
exports.CompanyScalarFieldEnumSchema = zod_1.z.enum(["id", "name", "storecode", "storeUniqueName", "logo", "description", "shopifyStoreName", "shopifyAccessToken", "tiktokCipher", "tiktokStoreName", "tiktokAccessToken", "tiktokAccessTokenExpireIn", "tiktokRefreshToken", "tiktokRefreshTokenExpireIn", "images", "isTaxIncluded", "status", "type", "accHolderName", "ifsc", "accountNo", "bankName", "gstin", "upiId", "billCounter", "barcodeCounter"]);
