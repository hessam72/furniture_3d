'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { Menu, Heart, ShoppingCart } from 'lucide-react'
import { useShop } from '@/stores/storeShopStore'
import type { Locale } from '@/i18n/routing'

const formatCount = (n: number, locale: Locale) =>
  new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(n)

interface StoreTopBarProps {
  onOpenMenu: () => void
  /** Shown centred once a camera flight has landed; null hides the chip */
  productName: string | null
  /** Catalogue id of the focused item, for the like toggle */
  productId: string | null
  /** Rendered beside like/cart — the gyroscope toggle, or nothing on desktop */
  children?: React.ReactNode
}

const BTN =
  'glass specular pointer-events-auto grid h-10 w-10 place-items-center rounded-full ' +
  'text-[var(--text-primary)] transition-colors duration-200 hover:text-[var(--gold-primary)] ' +
  'active:scale-95'

export default function StoreTopBar({
  onOpenMenu,
  productName,
  productId,
  children
}: StoreTopBarProps) {
  const locale = useLocale() as Locale
  const t = useTranslations('store')
  const liked = useShop((s) => s.liked)
  const cart = useShop((s) => s.cart)
  const toggleLike = useShop((s) => s.toggleLike)

  const isLiked = !!productId && liked.includes(productId)

  return (
    <div className="relative flex h-10 items-center justify-between">
      {/* Right (RTL start): menu */}
      <button onClick={onOpenMenu} aria-label={t('menu')} className={BTN}>
        <Menu className="h-[18px] w-[18px]" />
      </button>

      {/* Centre: product name, revealed after the camera lands */}
      <AnimatePresence>
        {productName && (
          <motion.div
            key={productName}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="glass specular pointer-events-none absolute left-1/2 max-w-[44%] -translate-x-1/2
                       truncate rounded-full px-4 py-1.5 text-center text-[12px]
                       text-[var(--text-primary)] md:max-w-[420px]"
          >
            {productName}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left (RTL end): gyroscope (mobile only), like, cart */}
      <div className="flex items-center gap-2">
        {children}

        <button
          onClick={() => productId && toggleLike(productId)}
          disabled={!productId}
          aria-label={t('like')}
          aria-pressed={isLiked}
          className={`${BTN} ${!productId ? 'opacity-40' : ''}`}
        >
          <Heart
            className={`h-[18px] w-[18px] transition-colors ${
              isLiked ? 'fill-[var(--gold-primary)] text-[var(--gold-primary)]' : ''
            }`}
          />
        </button>

        <button aria-label={t('cart')} className={`${BTN} relative`}>
          <ShoppingCart className="h-[18px] w-[18px]" />
          {cart.length > 0 && (
            <span
              className="persian-number absolute -bottom-0.5 -left-0.5 grid h-[18px] min-w-[18px]
                         place-items-center rounded-full bg-[var(--gold-primary)] px-1
                         text-[10px] font-bold text-black"
            >
              {formatCount(cart.length, locale)}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
