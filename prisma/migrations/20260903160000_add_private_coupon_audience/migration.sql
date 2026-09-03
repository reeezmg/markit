-- PRIVATE coupons are code-only: storefront discovery queries hide them, but
-- exact-code validation and checkout redemption can use them.
ALTER TYPE "CouponAudience" ADD VALUE IF NOT EXISTS 'PRIVATE';
