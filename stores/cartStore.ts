// // ~/store/cart.ts
// import { acceptHMRUpdate, defineStore } from 'pinia'; // Ensure correct import for ZenStack hooks
// import type { CartState, CartItem } from '~/types';
// import type { CartFetchResponse } from '~/types/cart';

// // Type Guard to check if an object is a valid CartItem
// function isCartItem(item: any): item is CartItem {
//     return (
//         item &&
//         typeof item.variantId === 'string' &&
//         (typeof item.size === 'string' || item.size === null) &&
//         (item.qty === undefined || typeof item.qty === 'number') &&
//         typeof item.name === 'string' &&
//         typeof item.price === 'number'
//     );
// }

// export const useCartStore = defineStore({
//     id: 'cart',
//     state: (): CartState => ({
//         items: [] as CartItem[],
//         companyId: '',
//         isMerging: false,
//         isLoading: false,
//         sessionId: ''
//     }),

//     actions: {
//         async mergeWithServerCart() {
//             if (this.isMerging) return;
//             this.isMerging = true;
            
//             try {
//               const auth = useClientAuth();
//               if (!auth.session.value) return;
      
//               const { items } = await $fetch<CartFetchResponse>('/api/cart/merge', {
//                 method: 'POST',
//                 body: { guestItems: this.items, companyId: this.companyId , clientId:auth.session.value.id}
//               });
              
//               this.items = items;
//             } catch (error) {
//               console.error('Cart merge failed:', error);
//             } finally {
//               this.isMerging = false;
//             }
//           },

//         // Method to add items to the cart
//         async addToCart(item: CartItem, companyId: string,sessionId?:string) {
//           if (!companyId) {
//             console.error('No company ID provided');
//             return;
//         }
//             if (companyId && (!this.companyId || this.companyId !== companyId)) {
              
//                 this.clear();
//                 this.companyId = companyId;
//                 // this.sessionId = sessionId
              
//             }
//             if (sessionId) {
//               this.sessionId = sessionId; // 🔥 Store it for later use
//             }
      
//             const existing = this.items.find(i => 
//               i.variantId === item.variantId && 
//               i.size === item.size
//             );
      
//             if (existing) {
//               existing.qty = (existing.qty || 1) + 1;
//             } else {
//               this.items.push({ ...item, qty: 1 });
//             }
//             console.log('sessionId store: ',this.sessionId)
//             await this.syncWithServer();
//           },

//           async syncWithServer() {
//             if (this.isLoading) return;
//             this.isLoading = true;
            
//             try {
//               const auth = useAuth();
//               if (!this.sessionId || !this.companyId) return;
//               console.log('session Id:',auth.session.value?.id)
//               await $fetch('/api/cart/update', {
//                 method: 'POST',
//                 body: { 
//                   companyId: this.companyId,
//                   clientId: this.sessionId,
//                   items: this.items 
//                 }
//               });
//             } catch (error) {
//               console.error('Cart sync failed:', error );
//             } finally {
//               this.isLoading = false;
//             }
//           },
      

//         // Method to remove an item from the cart
//         async removeFromCart(selectedItem: CartItem) {
//             this.items = this.items.filter(
//                 (item) =>
//                     !(item.variantId === selectedItem.variantId &&
//                         item.size === selectedItem.size)
//             );

//             if (this.items.length === 0) {
//                 this.companyId = '';
//             }

//             // Save the updated cart to the server
//             await this.syncWithServer();
//         },

//         // Method to increment item quantity
//         async incrementQty(cartItem: CartItem) {
//             const existingItem = this.items.find(
//                 (item) =>
//                     item.variantId === cartItem.variantId &&
//                     item.size === cartItem.size
//             );

//             if (existingItem) {
//                 existingItem.qty = (existingItem.qty || 1) + 1;
//             }

//             // Save the updated cart to the server
//             await this.syncWithServer();
//         },

//         // Method to decrement item quantity
//         async decrementQty(cartItem: CartItem) {
//             const existingItem = this.items.find(
//                 (item) =>
//                     item.variantId === cartItem.variantId &&
//                     item.size === cartItem.size
//             );

//             if (existingItem && existingItem.qty && existingItem.qty > 1) {
//                 existingItem.qty--;
//             } else {
//                 this.removeFromCart(cartItem);
//             }

//             // Save the updated cart to the server
//             await this.syncWithServer();
//         },

//         async fetchCart(companyId: string) {
//             this.isLoading = true;
//             try {
//               const auth = useClientAuth();
//               if (!auth.session.value) return;
      
//               const { items } = await $fetch<CartFetchResponse>('/api/cart/get', {
//                 query: { companyId ,clientId:auth.session.value.id }
//               });
              
//               this.items = items || [];
//               this.companyId = companyId;
//             } catch (error) {
//               console.error('Failed to fetch cart:', error);
//             } finally {
//               this.isLoading = false;
//             }
//           },



//         // Method to clear the cart
//         async clearCart() {
//           this.items = [];
//           try {
//             if (this.sessionId && this.companyId) {
//               await this.syncWithServer();
              
//             }
//           } catch (error) {
//             console.error('Failed to clear cart on server:', error);
//           }
        
//           this.items = [];
//           this.companyId = '';
//           this.sessionId = '';
//         },
//         clear(){
//           this.items = [];
//           this.companyId = '';
//           this.sessionId = '';
//         }
        
//     },

//     getters: {
//         cartItemCount(state: CartState): number {
//             return state.items.reduce((count, item) => count + (item.qty || 1), 0);
//         },
        

//         cartCompanyId(state: CartState): string {
//             return state.companyId;
//         },

//         cartItems: (state: CartState): CartItem[] => state.items,
//     },
// });

// if (import.meta.hot) {
//     import.meta.hot.accept(acceptHMRUpdate(useCartStore, import.meta.hot));
// }


import { acceptHMRUpdate, defineStore } from 'pinia';
import type { CartState, CartItem } from '~/types';
import type { CartFetchResponse } from '~/types/cart';

// Helper functions for localStorage
function safeParse<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function safeSet(key: string, value: any) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

export const useCartStore = defineStore({
  id: 'cart',
  state: (): CartState => ({
    items: safeParse<CartItem[]>('cart_items', []),
    companyId: safeParse<string>('cart_companyId', ''),
    isMerging: false,
    isLoading: false,
    sessionId: safeParse<string>('cart_sessionId', ''),
    lastSynced: safeParse<number>('cart_lastSynced', 0)
  }),

  actions: {
    // Persist state to localStorage
    persistState() {
      safeSet('cart_items', this.items);
      safeSet('cart_companyId', this.companyId);
      safeSet('cart_sessionId', this.sessionId);
      safeSet('cart_lastSynced', this.lastSynced);
    },

    // Clear local storage
    clearLocalStorage() {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cart_items');
        localStorage.removeItem('cart_companyId');
        localStorage.removeItem('cart_sessionId');
        localStorage.removeItem('cart_lastSynced');
      }
    },

    // Initialize cart reactively
    async initializeCart(companyId: string) {
      if (!companyId || this.isLoading) return;
      
      // Only initialize if company changed
      if (this.companyId !== companyId) {
        await this.fetchCart(companyId);
      }
    },

    // Merge local cart with server cart
    async mergeWithServerCart() {
      if (this.isMerging) return;
      this.isMerging = true;
      
      try {
        const auth = useClientAuth();
        if (!auth.session.value) return;

        const { items } = await $fetch<CartFetchResponse>('/api/cart/merge', {
          method: 'POST',
          body: { 
            guestItems: this.items,
            companyId: this.companyId,
            clientId: auth.session.value.id
          }
        });
        
        this.items = items;
        this.lastSynced = Date.now();
        this.persistState();
      } catch (error) {
        console.error('Cart merge failed:', error);
      } finally {
        this.isMerging = false;
      }
    },

    // Add item to cart
    async addToCart(item: CartItem, companyId: string, sessionId?: string) {
      if (!companyId) return;

      if (companyId && (!this.companyId || this.companyId !== companyId)) {
        await this.clearCart();
        this.companyId = companyId;
      }
      
      if (sessionId) this.sessionId = sessionId;

      const existing = this.items.find(i => 
        i.variantId === item.variantId && 
        i.size === item.size
      );

      if (existing) {
        existing.qty = (existing.qty || 1) + 1;
      } else {
        this.items.push({ ...item, qty: 1 });
      }

      this.persistState();
      await this.syncWithServer();
    },

    // Synchronize with server
    async syncWithServer() {
      if (this.isLoading) return;
      this.isLoading = true;
      
      try {
        const auth = useClientAuth();
        if (auth.session.value?.id && this.companyId) {
          await $fetch('/api/cart/update', {
            method: 'POST',
            body: { 
              companyId: this.companyId,
              clientId: auth.session.value.id,
              items: this.items 
            }
          });
          this.lastSynced = Date.now();
          this.persistState();
        }
      } catch (error) {
        console.error('Cart sync failed:', error);
      } finally {
        this.isLoading = false;
      }
    },

    // Fetch cart from server
    async fetchCart(companyId: string) {
      this.isLoading = true;
      try {
        const auth = useClientAuth();
        
        if (auth.session.value?.id) {
          const { items } = await $fetch<CartFetchResponse>('/api/cart/get', {
            query: { companyId, clientId: auth.session.value.id }
          });
          
          this.items = items || [];
          this.companyId = companyId;
        } else if (this.items.length > 0 && this.companyId === companyId) {
          // Keep existing local cart
          return;
        } else {
          this.items = [];
        }

        this.companyId = companyId;
        this.persistState();
      } catch (error) {
        console.error('Failed to fetch cart:', error);
      } finally {
        this.isLoading = false;
      }
    },

    // Clear cart completely
    async clearCart() {
      this.items = [];
      this.companyId = '';
      this.sessionId = '';
      this.lastSynced = 0;
      
      this.clearLocalStorage();
      try {
        await this.syncWithServer();
      } catch (error) {
        console.error('Failed to clear cart on server:', error);
      }
    },

    // Other cart methods
    async removeFromCart(item: CartItem) {
      this.items = this.items.filter(i => 
        !(i.variantId === item.variantId && i.size === item.size)
      );
      this.persistState();
      await this.syncWithServer();
    }
  },

  getters: {
    cartItemCount: (state) => state.items.reduce((count, item) => count + (item.qty || 1), 0),
    cartCompanyId: (state) => state.companyId,
    cartItems: (state) => state.items,
    isSynced: (state) => !!state.lastSynced && (Date.now() - state.lastSynced) < 300000 // 5 minutes
  }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCartStore, import.meta.hot));
}