import { acceptHMRUpdate, defineStore } from 'pinia';
import type { LikedProduct, LikeState } from '~/types';

export const useLikeStore = defineStore({
  id: 'like',
  state: (): LikeState => ({
    liked: [],
  }),

  actions: {
    toggleLike(product: LikedProduct) {
      const index = this.liked.findIndex(
        (item) => item.variantId === product.variantId
      );

      if (index >= 0) {
        this.liked.splice(index, 1); // Remove if already liked
      } else {
        this.liked.push(product); // Add if not liked
      }
    },

    isLiked(product: LikedProduct): boolean {
      return this.liked.some(
        (item) => item.variantId === product.variantId
      );
    },

    removeLike(product: LikedProduct) {
      this.liked = this.liked.filter(
        (item) => item.variantId !== product.variantId
      );
    },

    clearLikes() {
      this.liked = [];
    },
  },

  getters: {
    likedCount: (state): number => state.liked.length,
    likedItems: (state): LikedProduct[] => state.liked,
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLikeStore, import.meta.hot));
}
