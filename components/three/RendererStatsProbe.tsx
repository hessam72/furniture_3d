'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { collectTextureCosts } from '@/lib/three/textureBudget'
import { formatBytes, dropSample, reportSample } from './rendererStatsStore'

/**
 * Samples one renderer every two seconds. Mount inside a `<Canvas>`, under
 * `?debug`. The readout is `<RendererStatsOverlay />`, in the page's DOM.
 *
 * The texture walk is the expensive part — a full scene traverse building a Map
 * — which is why it is on the same slow interval as the rest and not in
 * `useFrame`. At two seconds it costs nothing and still catches a leak on the
 * swap that caused it.
 */
export function RendererStatsProbe({ label }: { label: string }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const viewport = useThree((s) => s.viewport)
  const frames = useRef(0)

  useFrame(() => {
    frames.current += 1
  })

  useEffect(() => {
    const canvas = gl.domElement
    const id = `${label}:${canvas.dataset.statsId ?? (canvas.dataset.statsId = String(Math.random()))}`

    const sample = () => {
      const costs = collectTextureCosts(scene)
      reportSample(id, {
        label,
        fps: frames.current / 2,
        dpr: viewport.dpr,
        vram: costs.reduce((total, cost) => total + cost.bytes, 0),
        textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries,
        programs: gl.info.programs?.length ?? 0,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        worst: costs
          .slice(0, 3)
          .map((cost) => `${cost.width}\u00d7${cost.height} ${formatBytes(cost.bytes)} ${cost.name.slice(0, 22)}`),
      })
      frames.current = 0
    }

    sample()
    const interval = window.setInterval(sample, 2000)
    return () => {
      window.clearInterval(interval)
      dropSample(id)
    }
  }, [gl, scene, viewport.dpr, label])

  return null
}
