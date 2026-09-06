'use client'

import { motion } from 'framer-motion'
import { Layers } from 'lucide-react'
import { usePresentation, type LayerStep } from '@/stores/presentationStore'
import type { PresentationConfig } from '@/lib/product/presentation'

const SPRING = { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 }

export default function LayerStepper({ config }: { config: PresentationConfig }) {
  const layerStep = usePresentation((s) => s.layerStep)
  const exploded = usePresentation((s) => s.exploded)
  const setLayerStep = usePresentation((s) => s.setLayerStep)
  const toggleExplode = usePresentation((s) => s.toggleExplode)

  // Two exclusive views, not a cumulative stack: the bare frame, or the
  // finished piece. `soft` only earns a label when the product actually ships
  // one — its meta is optional now.
  const soft = config.layers.soft
  const finished = soft
    ? `${soft.label} + ${config.layers.cover.label}`
    : config.layers.cover.label

  const steps: { step: LayerStep; label: string; desc?: string }[] = [
    { step: 0, label: config.layers.frame.label, desc: config.layers.frame.desc },
    { step: 1, label: finished, desc: config.layers.cover.desc },
  ]

  const activeDesc = steps.find((s) => s.step === layerStep)?.desc

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="لایه‌های محصول"
        className={`flex gap-1.5 rounded-full bg-white/[0.04] p-1 ${
          exploded ? 'pointer-events-none opacity-60 saturate-50' : ''
        }`}
      >
        {steps.map(({ step, label }) => {
          const active = step === layerStep
          return (
            <button
              key={step}
              role="radio"
              aria-checked={active}
              onClick={() => setLayerStep(step)}
              className={`relative flex-1 rounded-full px-2 py-1.5 text-[12px] transition-colors ${
                active ? 'text-black' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {active && (
                <motion.span
                  aria-hidden
                  layoutId="layer-step-pill"
                  transition={SPRING}
                  className="absolute inset-0 rounded-full bg-[var(--gold-primary)]"
                />
              )}
              <span className="relative">{label}</span>
            </button>
          )
        })}
      </div>

      {activeDesc && (
        <p className="text-[12px] leading-6 text-[var(--text-muted)]">{activeDesc}</p>
      )}

      <button
        onClick={toggleExplode}
        aria-pressed={exploded}
        className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-[13px]
                    transition-colors ${
                      exploded
                        ? 'border-[var(--gold-primary)] bg-[var(--gold-primary)]/10 text-[var(--gold-primary)]'
                        : 'border-white/[0.08] text-[var(--text-secondary)] hover:border-white/20'
                    }`}
      >
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          نمای انفجاری
        </span>
        <span
          aria-hidden
          className={`relative h-5 w-9 rounded-full transition-colors ${
            exploded ? 'bg-[var(--gold-primary)]' : 'bg-white/15'
          }`}
        >
          <motion.span
            layout
            transition={SPRING}
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
            style={exploded ? { left: 2 } : { right: 2 }}
          />
        </span>
      </button>
    </div>
  )
}
