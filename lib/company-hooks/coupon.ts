// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/coupon';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/coupon';
export const useFindManyCoupon = withCompanyRead(hooks.useFindManyCoupon, 'Coupon');
export const useCountCoupon = withCompanyRead(hooks.useCountCoupon, 'Coupon');
