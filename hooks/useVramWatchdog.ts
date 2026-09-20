'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { estimateTextureVram, formatBytes, TEXTURE_VRAM_WARN_BYTES } from '@/lib/three/textureBudget'
import { isDebug } from '@/components/three/rendererStatsStore'
import type { DeviceClass } from '@/lib/config/deviceTier'

/**
 * Catches the allocation `PerfLadder` cannot: the *second* one.
 *
 * `arch-docs/MOBILE_GPU_BUDGET.md` names the hole — PerfLadder reacts to
 * sustained FPS, and the tab dies at allocation time, before a frame is even
 * drawn, so it can never see a texture set coming. That is true of the
 * *first* allocation, this page's own manifest model. It is not true of the
 * second: a cover swap to a variant nobody has measured. By the time this
 * runs, the frame that swap would cost hasn't been asked to draw yet, so
 * there is still time to drop a rung before it is.
 *
 * Touch only — desktop has no canvas-memory ceiling to protect, and the
 * pixel budget is already generous there. @see lib/three/dprBudget.ts
 */
export function useVramWatchdog({
  modelPath,
  device,
  demote,
}: {
  /** Re-checked whenever this changes — a cover swap is the second
   *  allocation the note above is about. */
  modelPath: string
  device: DeviceClass
  /** Called at most once per `modelPath`, live. @see hooks/useContextRecovery */
  demote: () => void
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const checked = useRef(false)
  const scratch = useRef<THREE.Vector2>(new THREE.Vector2())

  useEffect(() => {
    checked.current = false
  }, [modelPath])

  useFrame(() => {
    if (checked.current || device === 'desktop') return
    checked.current = true

    const size = gl.getDrawingBufferSize(scratch.current)
    // The plain-framebuffer unit dprBudget prices touch hardware in: RGBA8
    // colour plus a 24/8 depth-stencil, 8 bytes a pixel. MSAA is already off
    // on touch, so this is the whole drawing-buffer cost, not an estimate.
    const bufferBytes = size.x * size.y * 8
    const textureBytes = estimateTextureVram(scene)
    const total = bufferBytes + textureBytes

    if (isDebug()) {
      console.log(
        `[vram-watchdog] ${formatBytes(textureBytes)} textures + ${formatBytes(bufferBytes)} buffer` +
          ` = ${formatBytes(total)} (warn ${formatBytes(TEXTURE_VRAM_WARN_BYTES)})`
      )
    }

    if (total > TEXTURE_VRAM_WARN_BYTES) {
      if (isDebug()) console.warn(`[vram-watchdog] over budget on "${modelPath}" — demoting one rung`)
      demote()
    }
  })
}
