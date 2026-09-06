'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, PanInfo } from 'framer-motion'
import { X, ChevronDown, ShoppingBag, Sparkles } from 'lucide-react'
import { hasPresentation } from '@/lib/product/presentation'
import { useFurnitureConfig } from '@/stores/furnitureConfigStore'
import { faPrice } from '@/lib/store/catalog'
import type { ProductData } from './ProductInteraction'
import { SpecDetails, SpecDimensions, SpecFabric } from './productSpecTabs'

interface ProductDrawerProps {
  product: ProductData | null
  /** products.json object key — the scene-object name, not product.id. Needed
   *  to link into the dedicated presentation route. */
  productKey?: string | null
  onClose: () => void
  onViewAR?: () => void
  onAddToCart?: () => void
}

type Tab = 'details' | 'fabric' | 'dimensions'

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'جزییات' },
  { id: 'fabric', label: 'جنس پارچه' },
  { id: 'dimensions', label: 'ابعاد' }
]

const SPRING = { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 }

export default function ProductDrawer({
  product,
  productKey,
  onClose,
  onViewAR,
  onAddToCart
}: ProductDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [expanded, setExpanded] = useState(false)
  const { setColor, currentColor } = useFurnitureConfig()

  if (!product) return null

  // Drag-down dismisses; the sheet is the only pointer-blocking surface, so the
  // canvas underneath keeps receiving look-drag while this is open
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) onClose()
  }

  const activeColorName = product.colors?.find((c) => c.hex === currentColor)?.name

  // Pieces without their own manifest fall back to the reference presentation,
  // so the drawer always offers a way into the dedicated product page.
  const detailHref = hasPresentation(productKey) ? `/product/${productKey}` : '/product/test'

  return (
    <motion.div
      dir="rtl"
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.04, bottom: 0.35 }}
      onDragEnd={handleDragEnd}
      initial={{ y: '110%' }}
      animate={{ y: 0 }}
      exit={{ y: '110%' }}
      transition={SPRING}
      className="font-persian fixed bottom-0 left-0 right-0 z-[99] mx-auto flex max-w-[560px]
                 flex-col overflow-hidden rounded-t-[28px] border-t border-white/[0.06]
                 bg-[var(--surface-2)]/85 backdrop-blur-2xl"
      style={{ boxShadow: '0 -18px 50px -20px rgb(0 0 0 / 80%)' }}
    >
      {/* Hairline gold edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px
                   bg-gradient-to-l from-transparent via-[var(--gold-line-hi)] to-transparent"
      />

      {/* Grab handle — doubles as the expand/collapse toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'بستن جزییات' : 'نمایش جزییات'}
        className="flex w-full cursor-grab justify-center pt-3 pb-1.5 active:cursor-grabbing"
      >
        <span className="h-1 w-10 rounded-full bg-white/25 transition-colors hover:bg-white/40" />
      </button>

      <div className="px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        {/* Title row */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
            {product.name}
          </h2>

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]
                         text-[var(--text-secondary)] transition-colors hover:bg-white/[0.06]
                         hover:text-[var(--gold-primary)]"
            >
              {expanded ? 'کمتر' : 'جزییات بیشتر'}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
            <button
              onClick={onClose}
              aria-label="بستن"
              className="rounded-full p-1.5 text-[var(--text-muted)] transition-colors
                         hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Colors — one line, bare circles */}
        {!!product.colors?.length && (
          <div className="scrollbar-hide mt-3 flex items-center gap-3 overflow-x-auto py-1">
            {product.colors.map((color) => {
              const active = currentColor === color.hex
              return (
                <button
                  key={color.hex}
                  onClick={() => setColor(color.hex)}
                  title={color.name}
                  aria-label={color.name}
                  aria-pressed={active}
                  className="relative h-7 w-7 shrink-0 rounded-full ring-1 ring-inset ring-white/20
                             transition-transform duration-300 ease-[var(--ease-cinematic)]
                             hover:scale-110 active:scale-95"
                  style={{ backgroundColor: color.hex }}
                >
                  {active && (
                    <motion.span
                      aria-hidden
                      layoutId="swatch-ring"
                      transition={SPRING}
                      className="absolute -inset-[3px] rounded-full ring-[1.5px] ring-[var(--gold-primary)]"
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Into the dedicated product page — visible whether or not the sheet is expanded */}
        <Link
          href={detailHref}
          /* Don't pull the heavy 3D chunk while the user is still browsing */
          prefetch={false}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border
                     border-[var(--gold-primary)]/40 py-2.5 text-[13px]
                     text-[var(--gold-primary)] transition-colors
                     hover:bg-[var(--gold-primary)]/10"
        >
          <Sparkles className="h-4 w-4" />
          مشاهده با جزییات
        </Link>

        {/* Expanded detail pane */}
        <motion.div
          initial={false}
          animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-3 border-t border-white/[0.06] pt-2">
            {/* Tabs — quiet underline strip */}
            <div className="scrollbar-hide flex gap-4 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative shrink-0 pb-2 pt-1 text-[13px] transition-colors ${
                    activeTab === tab.id
                      ? 'text-[var(--gold-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.span
                      layoutId="tab-underline"
                      transition={SPRING}
                      className="absolute inset-x-0 bottom-0 h-px bg-[var(--gold-primary)]"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="scrollbar-hide max-h-[26vh] overflow-y-auto overscroll-contain py-3 md:max-h-[38vh]">
              {activeTab === 'details' && <SpecDetails product={product} />}
              {activeTab === 'fabric' && <SpecFabric product={product} />}
              {activeTab === 'dimensions' && <SpecDimensions product={product} />}
            </div>

            {onViewAR && (
              <button
                onClick={onViewAR}
                className="mb-1 w-full rounded-xl border border-[var(--border-default)] py-2.5
                           text-[13px] text-[var(--gold-primary)] transition-colors
                           hover:bg-[var(--gold-primary)]/10"
              >
                مشاهده در واقعیت افزوده
              </button>
            )}
          </div>
        </motion.div>

        {/* Price + bag */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <div className="flex min-w-0 flex-col">
            {activeColorName && (
              <span className="truncate text-[11px] text-[var(--text-muted)]">{activeColorName}</span>
            )}
            <span className="persian-number text-[17px] font-bold leading-tight text-[var(--gold-primary)]">
              {product.price ? faPrice(product.price) : 'استعلام قیمت'}
            </span>
          </div>

          <button
            onClick={onAddToCart}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-l
                       from-[var(--gold-primary)] to-[var(--gold-warm)] px-5 text-[13px]
                       font-bold text-black shadow-lg shadow-[var(--gold-primary)]/20
                       transition-transform duration-200 active:scale-[0.97]"
          >
            <ShoppingBag className="h-4 w-4" />
            افزودن
          </button>
        </div>
      </div>
    </motion.div>
  )
}
