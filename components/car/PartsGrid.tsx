'use client'

import { useCarConfig } from '@/stores/carConfigStore'
import partsConfig from '@/public/config/car-parts.json'
import { IoCheckmark } from 'react-icons/io5'
import { MdImageNotSupported } from 'react-icons/md'

interface PartsGridProps {
  category: string
}

export default function PartsGrid({ category }: PartsGridProps) {
  const selectedParts = useCarConfig((s) => s.selectedParts)
  const selectPart = useCarConfig((s) => s.selectPart)

  const parts = partsConfig[category as keyof typeof partsConfig] || []

  if (parts.length === 0) {
    return (
      <div className="py-12 text-center">
        <MdImageNotSupported className="mx-auto mb-3 text-4xl text-white/25" />
        <p className="text-sm text-white/50">No parts available for this category</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
      {parts.map((part: any) => {
        const isSelected = selectedParts[category] === part.id

        return (
          <button
            key={part.id}
            onClick={() => selectPart(category, part.id)}
            aria-pressed={isSelected}
            className={`group relative rounded-xl border p-3 text-left transition-colors ${
              isSelected
                ? 'border-[#d4af37]/60 bg-[#d4af37]/5'
                : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
            }`}
          >
            {/* Thumbnail */}
            <div className="mb-2.5 aspect-square overflow-hidden rounded-lg border border-white/5 bg-black/30">
              {part.thumbnail ? (
                <img src={part.thumbnail} alt={part.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-white/25">
                  <MdImageNotSupported className="mb-1 text-2xl" />
                  <span className="text-[10px]">No Image</span>
                </div>
              )}
            </div>

            {/* Name */}
            <div className="mb-1 line-clamp-1 text-xs font-medium text-white/85 md:text-sm">
              {part.name}
            </div>

            {/* Price */}
            <div className={`text-[11px] tabular-nums ${part.price === 0 ? 'text-white/40' : 'text-[#d4af37]/90'}`}>
              {part.price === 0 ? 'Stock' : `$${part.price.toLocaleString()}`}
            </div>

            {/* Selected indicator */}
            {isSelected && (
              <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#d4af37]">
                <IoCheckmark className="text-sm text-black" />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
