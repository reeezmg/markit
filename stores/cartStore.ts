import { acceptHMRUpdate, defineStore } from 'pinia';
import type { CartState, CartItem } from '~/types';
import type { CartFetchResponse } from '~/types/cart';

// SSR-safe localStorage helpers
const safeParse = <T>(key: string, defaultValue: T): T => {
  if (process.server) return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const safeSet = (key: string, value: any) => {
  if (process.server) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('LocalStorage set failed:', error);
  }
};

export const useCartStore = defineStore({
  id: 'cart',
  state: (): CartState => ({
    items: [],
    companyId: '',
    isLoading: false,
    sessionId: '',
    lastSynced: 0,
    isHydrated: false
  }),

  getters: {
    cartItemCount: (state) => state.items.reduce((count, item) => count + (item.qty || 1), 0),
    cartCompanyId: (state) => state.companyId,
    cartItems: (state) => state.items,
    isSynced: (state) => !!state.lastSynced && (Date.now() - state.lastSynced) < 300000 // 5 minutes
  },

  actions: {
    // Hydrate from localStorage
    async hydrate() {
      if (this.isHydrated || process.server) return;
      
      this.$patch({
        items: safeParse<CartItem[]>('cart_items', []),
        companyId: safeParse<string>('cart_companyId', ''),
        sessionId: safeParse<string>('cart_sessionId', ''),
        lastSynced: safeParse<number>('cart_lastSynced', 0),
        isHydrated: true
      });
    },

    // Persist to localStorage
    persistState() {
      if (process.server || !this.isHydrated) return;
      safeSet('cart_items', this.items);
      safeSet('cart_companyId', this.companyId);
      safeSet('cart_sessionId', this.sessionId);
      safeSet('cart_lastSynced', this.lastSynced);
    },

    // Clear both state and localStorage
    clearLocalStorage() {
      if (process.server) return;
      ['cart_items', 'cart_companyId', 'cart_sessionId', 'cart_lastSynced'].forEach(key => {
        localStorage.removeItem(key);
      });
      this.$reset();
    },

    // Main cart modification method
    async addToCart(item: CartItem, companyId: string, sessionId?: string) {
      if (!companyId) throw new Error('Company ID is required');
      
      // Handle company change
      if (this.companyId && this.companyId !== companyId) {
        this.items = [];
      }

      // Update company ID if changed
      this.companyId = companyId;

      // Update session ID if provided (happens on login)
      if (!this.sessionId && sessionId) {
        this.sessionId = sessionId;
      }

      // Find existing item
      const existingIndex = this.items.findIndex(i => 
        i.variantId === item.variantId && 
        i.size === item.size
      );

      // Update or add item
      if (existingIndex >= 0) {
        this.items[existingIndex].qty = (this.items[existingIndex].qty || 1) + (item.qty || 1);
      } else {
        this.items.push({ 
          ...item, 
          qty: item.qty || 1 
        });
      }

      // Persist changes locally
      this.persistState();
      
      // Sync with server if we have a session
      if (this.sessionId) {
        await this._syncWithServer();
      }
    },

    // Remove item from cart
    async removeFromCart(item: CartItem) {
      this.items = this.items.filter(i => 
        !(i.variantId === item.variantId && i.size === item.size)
      );
      this.persistState();
      
      if (this.sessionId) {
        await this._syncWithServer();
      }
    },

    // Clear cart completely
    async clearCart() {
      this.items = [];
      this.companyId = '';
      this.sessionId = '';
      this.lastSynced = 0;
      this.clearLocalStorage();
      
      if (this.sessionId) {
        await this._syncWithServer();
      }
    },

    // Private method to merge guest cart with server cart
    async _mergeWithServerCart(sessionId:string,companyId:string) {
      this.sessionId = sessionId
      this.companyId = companyId
      if (!this.sessionId || !this.companyId || this.isLoading) return;
      this.isLoading = true;
      
      try {
        const { items } = await $fetch<CartFetchResponse>('/api/cart/merge', {
          method: 'POST',
          body: { 
            guestItems: this.items,
            companyId: this.companyId,
            clientId: this.sessionId
          }
        });
        
        if (items) {
          this.items = items;
          this.lastSynced = Date.now();
          this.persistState();
        }
      } catch (error) {
        console.error('Cart merge failed:', error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    // Private method to sync current state with server
    async _syncWithServer() {
      if (!this.sessionId || !this.companyId || this.isLoading) return;
      this.isLoading = true;
      
      try {
        await $fetch('/api/cart/update', {
          method: 'POST',
          body: { 
            companyId: this.companyId,
            clientId: this.sessionId,
            items: this.items 
          }
        });
        
        this.lastSynced = Date.now();
      } catch (error) {
        console.error('Cart sync failed:', error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    }
  }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCartStore, import.meta.hot));
}