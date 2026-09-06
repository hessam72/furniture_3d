'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { faPrice, itemsInSubCategory, type Catalog, type CatalogItem } from '@/lib/store/catalog'

const SPRING = { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 }
const EASE = { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }

interface CategoryBarProps {
  catalog: Catalog | null
  onSelect: (item: CatalogItem) => void
  /** Collapses the drill-down — used while a camera flight is in progress */
  collapsed?: boolean
}

/**
 * Category → subcategory → product drill-down, rendered as liquid-glass rows
 * over the 3D scene. Each level expands the next below it; picking a product
 * collapses the whole thing back to the four main pills.
 */
export default function CategoryBar({ catalog, onSelect, collapsed }: CategoryBarProps) {
  const [mainId, setMainId] = useState<string | null>(null)
  const [subId, setSubId] = useState<string | null>(null)

  useEffect(() => {
    if (collapsed) {
      setMainId(null)
      setSubId(null)
    }
  }, [collapsed])

  if (!catalog) return null

  const main = catalog.categories.find((c) => c.id === mainId) ?? null
  const items = main && subId ? itemsInSubCategory(catalog, main.id, subId) : []

  const pickMain = (id: string) => {
    setSubId(null)
    setMainId((cur) => (cur === id ? null : id))
  }

  return (
    <div className="pointer-events-auto mt-2.5">
      {/* Level 1 — the four main categories */}
      <div className="scrollbar-hide flex gap-2 overflow-x-auto">
        {catalog.categories.map((cat) => {
          const active = mainId === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => pickMain(cat.id)}
                 style={{
                      backdropFilter: 'blur(30px)',
                      fontWeight: ' bold',
                      // color: ' #fff',
                    }}
              className={`glass specular relative shrink-0 rounded-full px-4 py-2 text-[12px]
                          transition-colors duration-200 ${active
                  ? 'glass-gold text-[var(--gold-primary)]'
                  : 'text-[var(--text-primary)] hover:text-[var(--gold-primary)]'
                }`}
            >
              {/* The tint has to be its own layer: `glass` sets the
                  `background` shorthand, so a bg-* utility on this element
                  resolves to transparent */}
              {active && (
                <motion.span
                  layoutId="cat-active"
                  transition={SPRING}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-[#d4af37]/12"
                />
              )}
              <span className="relative">{cat.label}</span>
            </button>
          )
        })}
      </div>

      {/* Level 2 + 3 — subcategories, then the products inside one */}
      <AnimatePresence initial={false}>
        {main && (
          <motion.div
            key={main.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE}
            className="overflow-hidden"
          >
            <div className="scrollbar-hide mt-2 flex gap-2 overflow-x-auto">
              {main.subCategories.map((sub) => {
                const active = subId === sub.id
                return (
                  <button
                    key={sub.id}
                    style={{
                      backdropFilter: 'blur(30px)',
                      fontWeight: ' bold',
                      // color: ' #fff',
                    }}
                    onClick={() => setSubId((cur) => (cur === sub.id ? null : sub.id))}
                    className={`glass-flat shrink-0 rounded-full px-3 py-1.5 text-[11px]
                                transition-colors duration-200 ${active
                        ? 'glass-gold text-[var(--gold-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    {sub.label}
                  </button>
                )
              })}
            </div>

            <AnimatePresence initial={false}>
              {subId && (
                <motion.ul
                  key={subId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={EASE}
                  className="scrollbar-hide mt-2 max-h-[38vh] space-y-1.5 overflow-y-auto overscroll-contain"
                >
                  {items.length === 0 && (
                    <li className="glass-flat rounded-xl px-3.5 py-3 text-center text-[11px] text-[var(--text-muted)]">
                      به زودی
                    </li>
                  )}

                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        style={{
                          backdropFilter: 'blur(30px)',
                          fontWeight: ' bold',
                          color: ' #fff',
                        }}
                        onClick={() => onSelect(item)}
                        className="glass-flat specular flex w-full items-center justify-between gap-3
                                   rounded-xl px-3.5 py-2.5 text-right transition-colors duration-200
                                   hover:border-[var(--color-gold-line-hi)] active:scale-[0.99]"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[12px] text-[var(--text-primary)]">
                            {item.name}
                          </span>
                          <span className="persian-number text-[11px] text-[var(--gold-primary)]">
                            {faPrice(item.price)}
                          </span>
                        </span>
                        <ChevronLeft className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
