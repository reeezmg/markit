// ~/store/cart.ts
import { acceptHMRUpdate, defineStore } from 'pinia'; // Ensure correct import for ZenStack hooks
import type { CartState, CartItem } from '~/types';
import type { CartFetchResponse } from '~/types/cart';

// Type Guard to check if an object is a valid CartItem
function isCartItem(item: any): item is CartItem {
    return (
        item &&
        typeof item.variantId === 'string' &&
        (typeof item.size === 'string' || item.size === null) &&
        (item.qty === undefined || typeof item.qty === 'number') &&
        typeof item.name === 'string' &&
        typeof item.price === 'number'
    );
}

export const useCartStore = defineStore({
    id: 'cart',
    state: (): CartState => ({
        items: [] as CartItem[],
        companyId: '',
        isMerging: false,
        isLoading: false,
        sessionId: ''
    }),

    actions: {
        async mergeWithServerCart() {
            if (this.isMerging) return;
            this.isMerging = true;
            
            try {
              const auth = useClientAuth();
              if (!auth.session.value) return;
      
              const { items } = await $fetch<CartFetchResponse>('/api/cart/merge', {
                method: 'POST',
                body: { guestItems: this.items, companyId: this.companyId , clientId:auth.session.value.id}
              });
              
              this.items = items;
            } catch (error) {
              console.error('Cart merge failed:', error);
            } finally {
              this.isMerging = false;
            }
          },

        // Method to add items to the cart
        async addToCart(item: CartItem, companyId: string,sessionId?:string) {
          if (!companyId) {
            console.error('No company ID provided');
            return;
        }
            if (companyId && (!this.companyId || this.companyId !== companyId)) {
              
                this.clear();
                this.companyId = companyId;
                // this.sessionId = sessionId
              
            }
            if (sessionId) {
              this.sessionId = sessionId; // 🔥 Store it for later use
            }
      
            const existing = this.items.find(i => 
              i.variantId === item.variantId && 
              i.size === item.size
            );
      
            if (existing) {
              existing.qty = (existing.qty || 1) + 1;
            } else {
              this.items.push({ ...item, qty: 1 });
            }
            console.log('sessionId store: ',this.sessionId)
            await this.syncWithServer();
          },

          async syncWithServer() {
            if (this.isLoading) return;
            this.isLoading = true;
            
            try {
              const auth = useAuth();
              if (!this.sessionId || !this.companyId) return;
              console.log('session Id:',auth.session.value?.id)
              await $fetch('/api/cart/update', {
                method: 'POST',
                body: { 
                  companyId: this.companyId,
                  clientId: this.sessionId,
                  items: this.items 
                }
              });
            } catch (error) {
              console.error('Cart sync failed:', error );
            } finally {
              this.isLoading = false;
            }
          },
      

        // Method to remove an item from the cart
        async removeFromCart(selectedItem: CartItem) {
            this.items = this.items.filter(
                (item) =>
                    !(item.variantId === selectedItem.variantId &&
                        item.size === selectedItem.size)
            );

            if (this.items.length === 0) {
                this.companyId = '';
            }

            // Save the updated cart to the server
            await this.syncWithServer();
        },

        // Method to increment item quantity
        async incrementQty(cartItem: CartItem) {
            const existingItem = this.items.find(
                (item) =>
                    item.variantId === cartItem.variantId &&
                    item.size === cartItem.size
            );

            if (existingItem) {
                existingItem.qty = (existingItem.qty || 1) + 1;
            }

            // Save the updated cart to the server
            await this.syncWithServer();
        },

        // Method to decrement item quantity
        async decrementQty(cartItem: CartItem) {
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

            // Save the updated cart to the server
            await this.syncWithServer();
        },

        async fetchCart(companyId: string) {
            this.isLoading = true;
            try {
              const auth = useClientAuth();
              if (!auth.session.value) return;
      
              const { items } = await $fetch<CartFetchResponse>('/api/cart/get', {
                query: { companyId ,clientId:auth.session.value.id }
              });
              
              this.items = items || [];
              this.companyId = companyId;
            } catch (error) {
              console.error('Failed to fetch cart:', error);
            } finally {
              this.isLoading = false;
            }
          },



        // Method to clear the cart
        async clearCart() {
          this.items = [];
          try {
            if (this.sessionId && this.companyId) {
              await this.syncWithServer();
              
            }
          } catch (error) {
            console.error('Failed to clear cart on server:', error);
          }
        
          this.items = [];
          this.companyId = '';
          this.sessionId = '';
        },
        clear(){
          this.items = [];
          this.companyId = '';
          this.sessionId = '';
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
