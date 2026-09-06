'use client'

import type { ProductData } from './ProductInteraction'

/** Shared by the showroom drawer and the presentation sheet so a spec row is
 *  never described two different ways. */

export function SpecDetails({ product }: { product: ProductData }) {
  return (
    <p className="text-[13px] leading-7 text-[var(--text-secondary)]">
      {product.detailedDescription || 'توضیحات موجود نیست'}
    </p>
  )
}

export function SpecFabric({ product }: { product: ProductData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 text-[13px]">
        <span className="text-[var(--text-muted)]">جنس اصلی:</span>
        <span className="text-[var(--text-primary)]">{product.fabricType || 'موجود نیست'}</span>
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
  const specs = [
    { label: 'ابعاد', value: product.dimensions },
    { label: 'جنس', value: product.material },
    { label: 'وزن', value: product.weight },
    { label: 'دسته‌بندی', value: product.category },
    { label: 'نوع', value: product.type },
    { label: 'ظرفیت نشستن', value: product.seatingCapacity },
    { label: 'تعداد قفسه', value: product.shelves },
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
