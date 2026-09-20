'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { X, Volume2, VolumeX, RotateCcw } from 'lucide-react'
import QualitySelector from '@/components/car/QualitySelector'
import { useShop } from '@/stores/storeShopStore'
import { getHomeCopy } from '@/lib/content/home'
import LocaleSwitcher from '@/components/i18n/LocaleSwitcher'
import type { QualityPreset } from '@/lib/config/quality'
import type { Locale } from '@/i18n/routing'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface StoreSidebarProps {
  open: boolean
  onClose: () => void
  returnFocusTo?: React.RefObject<HTMLElement>
  onResetCamera?: () => void
}

/**
 * Right-hand slide-in panel. Focus handling mirrors components/landing/MobileMenu.tsx
 * minus the Lenis scroll-lock — /store never scrolls.
 */
export default function StoreSidebar({ open, onClose, returnFocusTo, onResetCamera }: StoreSidebarProps) {
  const locale = useLocale() as Locale
  const t = useTranslations('store')
  const tq = useTranslations('quality')
  const tc = useTranslations('common')
  const { brand } = getHomeCopy(locale)
  const QUALITY_LABELS: Record<QualityPreset, string> = {
    low: tq('low'),
    medium: tq('medium'),
    high: tq('high'),
    ultra: tq('ultra'),
  }
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const muted = useShop((s) => s.muted)
  const toggleMuted = useShop((s) => s.toggleMuted)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!nodes?.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocusTo?.current?.focus()
    }
  }, [open, onClose, returnFocusTo])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/55"
          />

          <motion.aside
            dir={locale === 'fa' ? 'rtl' : 'ltr'}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('menuAria')}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            style={{
              backdropFilter:'blur(20px)'
            }}
            transition={{ type: 'spring', damping: 34, stiffness: 320, mass: 0.8 }}
            className="glass font-persian fixed inset-y-0 right-0 z-[71] flex w-[78%] max-w-[320px]
                       flex-col rounded-l-[24px] px-5
                       pt-[max(1rem,env(safe-area-inset-top))]
                       pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex h-11 items-center justify-between">
              <span className="text-[13px] font-bold tracking-tight text-[var(--gold-primary)]">
                {brand.name}
              </span>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label={t('closeMenu')}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)]
                           transition-colors hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex flex-1 flex-col gap-5 overflow-y-auto">
              {/* Reset camera view */}
              <section>
                <h3 className="mb-2 text-[11px] text-[var(--text-muted)]">{t('cameraView')}</h3>
                <button
                  onClick={() => {
                    onResetCamera?.()
                    onClose()
                  }}
                  className="glass-flat flex w-full items-center justify-between rounded-xl px-3.5 py-3
                             text-[13px] text-[var(--text-primary)] transition-colors
                             hover:border-[var(--color-gold-line-hi)]"
                >
                  <span>{t('resetView')}</span>
                  <RotateCcw className="h-4 w-4 text-[var(--gold-primary)]" />
                </button>
              </section>

              {/* Ambient sound */}
              <section>
                <h3 className="mb-2 text-[11px] text-[var(--text-muted)]">{t('sound')}</h3>
                <button
                  onClick={toggleMuted}
                  aria-pressed={!muted}
                  className="glass-flat flex w-full items-center justify-between rounded-xl px-3.5 py-3
                             text-[13px] text-[var(--text-primary)] transition-colors
                             hover:border-[var(--color-gold-line-hi)]"
                >
                  <span>{muted ? t('soundOff') : t('soundOn')}</span>
                  {muted ? (
                    <VolumeX className="h-4 w-4 text-[var(--text-muted)]" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-[var(--gold-primary)]" />
                  )}
                </button>
              </section>

              {/* Graphics quality — shares the persisted tier with /car */}
              <section>
                <h3 className="mb-2 text-[11px] text-[var(--text-muted)]">{tq('heading')}</h3>
                <div className="glass-flat rounded-xl p-3.5" dir="ltr">
                  <QualitySelector labels={QUALITY_LABELS} heading={tq('heading')} />
                </div>
              </section>

              {/* Language */}
              <section>
                <h3 className="mb-2 text-[11px] text-[var(--text-muted)]">{tc('language')}</h3>
                <LocaleSwitcher />
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
