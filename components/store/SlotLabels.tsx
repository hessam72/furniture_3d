'use client'
import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useLocale, useTranslations } from 'next-intl'
import { findAnchor, slotPose, type RoomRoot } from '@/lib/store/roomAnchors'
import type { RoomSlot } from './hooks/useStoreConfig'

/** Above a standing piece's seat, below a tall one's top — readable either way */
const LABEL_LIFT = 1.1

/**
 * `?view-stage=1` — every slot's number, floating over its anchor, empty or
 * not. It is how a showroom learns which spot «۷» is before choosing what
 * stands there in the panel's placements board, so it reads the same way the
 * board does: «جایگاه ۷» with the slot's own label under it.
 *
 * DOM rather than 3D text: Persian needs real shaping, and an overlay that is
 * never occluded is the point of a debug view.
 */
export function SlotLabels({
  slots,
  roots,
  occupied,
}: {
  slots: RoomSlot[]
  roots: RoomRoot[]
  /** Slot numbers something stands on */
  occupied: Set<number>
}) {
  const t = useTranslations('store')
  const locale = useLocale()

  const labels = useMemo(
    () =>
      slots.flatMap((slot) => {
        const anchor = findAnchor(roots, slot.anchor)
        return anchor ? [{ slot, position: slotPose(anchor).position }] : []
      }),
    [slots, roots]
  )

  const digits = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US')

  return (
    <>
      {labels.map(({ slot, position: [x, y, z] }) => (
        <Html
          key={slot.number}
          position={[x, y + LABEL_LIFT, z]}
          center
          pointerEvents="none"
          zIndexRange={[20, 0]}
        >
          <div
            dir={locale === 'fa' ? 'rtl' : 'ltr'}
            className="font-persian pointer-events-none select-none whitespace-nowrap
                       rounded-xl border border-[#d4af37]/60 bg-black/70 px-3 py-1 text-center text-white"
          >
            <div className="text-sm font-medium">{t('slot', { number: digits.format(slot.number) })}</div>
            {slot.label && <div className="text-[11px] text-white/70">{slot.label}</div>}
            {!occupied.has(slot.number) && <div className="text-[10px] text-[#d4af37]/80">{t('slotEmpty')}</div>}
          </div>
        </Html>
      ))}
    </>
  )
}
