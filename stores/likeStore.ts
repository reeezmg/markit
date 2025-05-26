
import { acceptHMRUpdate, defineStore } from 'pinia';
import type { LikedProduct, LikeState } from '~/types';

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

export const useLikeStore = defineStore({
  id: 'like',
  state: (): LikeState => ({
    liked: [],
    companyId: '',
    isLoading: false,
    sessionId: '',
    lastSynced: 0,
    isHydrated: false
  }),

  getters: {
    likedCount: (state): number => state.liked.length,
    likedItems: (state): LikedProduct[] => state.liked,
    isSynced: (state) => !!state.lastSynced && (Date.now() - state.lastSynced) < 300000, // 5 minutes
    isLiked: (state) => {
    return (product: LikedProduct) => state.liked.some(
      (item) => item.variantId === product.variantId
    );
  }
  },

  actions: {
    // Hydrate from localStorage
    async hydrate() {
      if (this.isHydrated || process.server) return;
      
      this.$patch({
        liked: safeParse<LikedProduct[]>('like_items', []),
        companyId: safeParse<string>('like_companyId', ''),
        sessionId: safeParse<string>('like_sessionId', ''),
        lastSynced: safeParse<number>('like_lastSynced', 0),
        isHydrated: true
      });
    },

    // Persist to localStorage
    persistState() {
      if (process.server || !this.isHydrated) return;
      safeSet('like_items', this.liked);
      safeSet('like_companyId', this.companyId);
      safeSet('like_sessionId', this.sessionId);
      safeSet('like_lastSynced', this.lastSynced);
    },

    // Clear both state and localStorage
    clearLocalStorage() {
      if (process.server) return;
      ['like_items', 'like_companyId', 'like_sessionId', 'like_lastSynced'].forEach(key => {
        localStorage.removeItem(key);
      });
      this.$reset();
    },

    // Main like modification method
    async toggleLike(product: LikedProduct, companyId: string, sessionId?: string) {
      if (!companyId) throw new Error('Company ID is required');
      
      // Handle company change
      if (this.companyId && this.companyId !== companyId) {
        this.liked = [];
      }

      // Update company ID if changed
      this.companyId = companyId;

      // Update session ID if provided (happens on login)
      if (!this.sessionId && sessionId) {
        this.sessionId = sessionId;
      }

      // Find existing item
      const existingIndex = this.liked.findIndex(i => i.variantId === product.variantId);

      // Toggle like status
      if (existingIndex >= 0) {
        this.liked.splice(existingIndex, 1);
      } else {
        this.liked.push({ variantId: product.variantId });
      }

      // Persist changes locally
      this.persistState();
      
      // Sync with server if we have a session
      if (this.sessionId) {
        await this._syncWithServer();
      }

      return existingIndex < 0; // Returns true if item was liked, false if unliked
    },

    // Remove specific like
    async removeLike(product: LikedProduct) {
      this.liked = this.liked.filter(i => i.variantId !== product.variantId);
      this.persistState();
      
      if (this.sessionId) {
        await this._syncWithServer();
      }
    },

    // Clear all likes
    async clearLikes() {
      this.liked = [];
      this.companyId = '';
      this.sessionId = '';
      this.lastSynced = 0;
      this.clearLocalStorage();
      
      if (this.sessionId) {
        await this._syncWithServer();
      }
    },

    // Private method to merge guest likes with server likes
    async _mergeWithServerLikes(sessionId: string, companyId: string) {
      this.sessionId = sessionId;
      this.companyId = companyId;
      
      if (!this.sessionId || !this.companyId || this.isLoading) return;
      this.isLoading = true;
      
      try {
        const { items } = await $fetch<{ items: LikedProduct[] }>('/api/like/merge', {
          method: 'POST',
          body: { 
            guestItems: this.liked,
            companyId: this.companyId,
            clientId: this.sessionId
          }
        });
        
        if (items) {
          this.liked = items;
          this.lastSynced = Date.now();
          this.persistState();
        }
      } catch (error) {
        console.error('Like merge failed:', error);
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
        await $fetch('/api/like/update', {
          method: 'POST',
          body: { 
            companyId: this.companyId,
            clientId: this.sessionId,
            items: this.liked
          }
        });
        
        this.lastSynced = Date.now();
        this.persistState();
      } catch (error) {
        console.error('Like sync failed:', error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    // Fetch likes from server
    async fetchLikes(companyId: string, sessionId: string) {
  if (!companyId || !sessionId) return;
  
  this.companyId = companyId;
  this.sessionId = sessionId;
  this.isLoading = true;
  
  try {
    const { items } = await $fetch<{ items: LikedProduct[] }>('/api/like/get', {
      query: { 
        companyId, 
        clientId: sessionId,
        includeVariant: 'true'
      }
    });
    
    if (items) {
      this.liked = items;
      this.lastSynced = Date.now();
      this.persistState();
    }
  } catch (error) {
    console.error('Failed to fetch likes:', error);
    throw error;
  } finally {
    this.isLoading = false;
  }
}
  }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLikeStore, import.meta.hot));
}