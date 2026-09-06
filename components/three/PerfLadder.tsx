'use client'

import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei'

interface PerfLadderProps {
  /** Reported sustained-FPS scale in [0.7, 1] — multiply into the Canvas max DPR */
  onScale: (updater: (prev: number) => number) => void
  /** Mount AdaptiveDpr (drops DPR while performance.regress() is active) */
  adaptive?: boolean
}

/**
 * Shared sustained-FPS ladder used by the /car and /store scenes.
 *
 * PerformanceMonitor steps the reported scale down (1 → 0.85 → 0.7) when the
 * frame rate can't hold, and back up when it can — quality yields only under
 * real load and recovers automatically. The fps>=5 guard skips the poisoned
 * sample a demand-frameloop idle gap produces. AdaptiveDpr additionally drops
 * DPR while something calls performance.regress() (OrbitControls on /car,
 * movement/look input on /store), restoring when idle.
 */
export function PerfLadder({ onScale, adaptive = true }: PerfLadderProps) {
  return (
    <>
      {adaptive && <AdaptiveDpr pixelated />}
      <PerformanceMonitor
        flipflops={4}
        onDecline={(api) => {
          if (api.fps >= 5) onScale((s) => Math.max(0.7, +(s - 0.15).toFixed(2)))
        }}
        onIncline={() => onScale((s) => Math.min(1, +(s + 0.15).toFixed(2)))}
        onFallback={() => onScale(() => 0.7)}
      />
    </>
  )
}
