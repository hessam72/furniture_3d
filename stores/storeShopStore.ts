import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Likes and cart for the showroom HUD. Catalogue-item ids, not scene objects —
 * several catalogue entries share one mesh, and they're liked separately.
 */
interface ShopState {
  liked: string[]
  cart: string[]
  /** Ambient audio mute. Lives here so the sidebar can drive AudioPlayer. */
  muted: boolean
  toggleLike: (id: string) => void
  addToCart: (id: string) => void
  clearCart: () => void
  toggleMuted: () => void
}

export const useShop = create<ShopState>()(
  persist(
    (set) => ({
      liked: [],
      cart: [],
      muted: false,
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      toggleLike: (id) =>
        set((s) => ({
          liked: s.liked.includes(id) ? s.liked.filter((x) => x !== id) : [...s.liked, id]
        })),
      addToCart: (id) => set((s) => ({ cart: [...s.cart, id] })),
      clearCart: () => set({ cart: [] })
    }),
    { name: 'store-shop' }
  )
)
