'use client'

import { useTranslations } from 'next-intl'
import type { ProductData } from './ProductInteraction'

/** Shared by the showroom drawer and the presentation sheet so a spec row is
 *  never described two different ways. */

export function SpecDetails({ product }: { product: ProductData }) {
  const t = useTranslations('specs')
  return (
    <p className="text-[13px] leading-7 text-[var(--text-secondary)]">
      {product.detailedDescription || t('noDescription')}
    </p>
  )
}

export function SpecFabric({ product }: { product: ProductData }) {
  const t = useTranslations('specs')
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 text-[13px]">
        <span className="text-[var(--text-muted)]">{t('mainMaterial')}:</span>
        <span className="text-[var(--text-primary)]">{product.fabricType || t('notAvailable')}</span>
      </div>
      <ul className="space-y-1.5">
        {product.fabricMaterials?.map((material) => (
          <li key={material} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--gold-primary)]" />
            {material}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SpecDimensions({ product }: { product: ProductData }) {
  const t = useTranslations('specs')
  const specs = [
    { label: t('dimensions'), value: product.dimensions },
    { label: t('material'), value: product.material },
    { label: t('weight'), value: product.weight },
    { label: t('category'), value: product.category },
    { label: t('type'), value: product.type },
    { label: t('seatingCapacity'), value: product.seatingCapacity },
    { label: t('shelves'), value: product.shelves },
  ].filter((spec) => spec.value)

  return (
    <dl className="grid gap-px overflow-hidden rounded-xl bg-white/[0.06]">
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="flex items-center justify-between bg-[var(--surface-2)] px-3.5 py-2.5 text-[13px]"
        >
          <dt className="text-[var(--text-muted)]">{spec.label}</dt>
          <dd className="text-[var(--text-primary)]">{spec.value}</dd>
        </div>
      ))}
    </dl>
  )
}
