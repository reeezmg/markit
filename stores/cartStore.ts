import { acceptHMRUpdate, defineStore } from 'pinia';
import type { CartState, CartItem } from '~/types';

export const useCartStore = defineStore({
    id: 'cart',
    state: (): CartState => ({
        items: [] as CartItem[],
        companyId: ''
    }),

    actions: {
        addToCart(selectedItem: CartItem, companyId?: string) {
            if (companyId) {
                if (this.companyId && this.companyId !== companyId) {
                    this.clear();
                }
                this.companyId = companyId;
            }

            const existingItem = this.items.find(
                (item) =>
                    item.variantId === selectedItem.variantId &&
                    item.size === selectedItem.size
            );

            if (existingItem) {
                existingItem.qty = (existingItem.qty || 1) + 1;
            } else {
                this.items.push({ ...selectedItem, qty: 1 });
            }
        },

        removeFromCart(selectedItem: CartItem) {
            this.items = this.items.filter(
                (item) =>
                    !(item.variantId === selectedItem.variantId &&
                      item.size === selectedItem.size)
            );

            if (this.items.length === 0) {
                this.companyId = '';
            }
        },

        incrementQty(cartItem: CartItem) {
            const existingItem = this.items.find(
                (item) =>
                    item.variantId === cartItem.variantId &&
                    item.size === cartItem.size
            );

            if (existingItem) {
                existingItem.qty = (existingItem.qty || 1) + 1;
            }
        },

        decrementQty(cartItem: CartItem) {
            const existingItem = this.items.find(
                (item) =>
                    item.variantId === cartItem.variantId &&
                    item.size === cartItem.size
            );

            if (existingItem && existingItem.qty && existingItem.qty > 1) {
                existingItem.qty--;
            } else {
                this.removeFromCart(cartItem);
            }
        },

        clear() {
            this.items = [];
            this.companyId = '';
        }
    },

    getters: {
        cartItemCount(state: CartState): number {
            return state.items.reduce((count, item) => count + (item.qty || 1), 0);
        },
        cartCompanyId(state: CartState): string {
            return state.companyId;
        },
        cartItems: (state: CartState): CartItem[] => state.items,
    },
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCartStore, import.meta.hot));
}
