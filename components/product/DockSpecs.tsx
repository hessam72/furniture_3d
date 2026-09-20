'use client'

import { useTranslations } from 'next-intl'
import type { ProductData } from '@/components/store/ProductInteraction'

/**
 * The product's facts, in the dock's own dark styling.
 *
 * Deliberately not `productSpecTabs`: those are written against the gold surface
 * tokens the showroom drawer and `/product/[id]` share, and dropping them into a
 * blue-accented glass panel gives you two design systems in one column. Same
 * fields, same order, same fallbacks — the difference is entirely the skin.
 */
export default function DockSpecs({ product }: { product: ProductData }) {
  const t = useTranslations('specs')
  const specs = [
    { label: t('dimensions'), value: product.dimensions },
    { label: t('material'), value: product.material },
    { label: t('fabricType'), value: product.fabricType },
    { label: t('weight'), value: product.weight },
    { label: t('seatingCapacity'), value: product.seatingCapacity },
    { label: t('category'), value: product.category },
    { label: t('type'), value: product.type },
    { label: t('shelves'), value: product.shelves },
  ].filter((spec) => spec.value)

  return (
    <div className="space-y-4">
      {product.detailedDescription && (
        <p className="text-[12.5px] leading-[2] text-white/55">{product.detailedDescription}</p>
      )}

      {specs.length > 0 && (
        /* `gap-px` over a lighter ground is the divider: one rule for every row
           including the last, with nothing to special-case. */
        <dl className="grid gap-px overflow-hidden rounded-2xl bg-white/[0.07]">
          {specs.map((spec) => (
            <div
              key={spec.label}
              className="flex items-center justify-between gap-3 bg-[#0e131c] px-3.5 py-2.5 text-[12.5px]"
            >
              <dt className="shrink-0 text-white/40">{spec.label}</dt>
              {/* `dir="auto"` because these values mix scripts — "85 kg",
                  "240cm × 95cm" — and an RTL paragraph reorders them into
                  nonsense. The first strong character decides, per value. */}
              <dd dir="auto" className="persian-number truncate text-white/85">{spec.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {!!product.fabricMaterials?.length && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">{t('fabricComposition')}</p>
          <ul className="space-y-1.5">
            {product.fabricMaterials.map((material) => (
              <li key={material} className="flex items-start gap-2 text-[12.5px] leading-6 text-white/60">
                <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                {material}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!specs.length && !product.detailedDescription && (
        <p className="text-[12.5px] text-white/40">{t('noSpecs')}</p>
      )}
    </div>
  )
}
