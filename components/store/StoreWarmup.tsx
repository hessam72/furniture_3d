'use client'
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { batchStaticMeshes } from '@/lib/store/staticBatch'
import { isDebug } from '@/components/three/rendererStatsStore'
import type { ProductData } from './ProductInteraction'
import { requestShadowUpdate } from './staticShadows'

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'alphaMap', 'bumpMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularIntensityMap',
  'specularColorMap', 'transmissionMap', 'thicknessMap',
] as const

/**
 * Pays every one-off cost before the intro starts, behind the loading screen.
 *
 * Nothing did this before, so the costs landed on the fly-in and the first
 * steps: every program compiled on first sight, every KTX2 texture uploaded on
 * first draw, and the lamps mounted mid-flight and recompiled the lot again.
 * In order:
 *
 *  1. batch the room's static meshes (needs products.json to know what to
 *     leave alone — skipped if it failed to load, never guessed);
 *  2. two frames for the lamp slots to mount, so the light count the programs
 *     are compiled against is the final one;
 *  3. compile every program (parallel where KHR_parallel_shader_compile
 *     exists) and upload every texture;
 *  4. draw the frozen shadow maps once.
 *
 * Runs again on every remount (AR return, context-loss retry), which is what
 * a fresh clone from the loader cache needs.
 */
export function StoreWarmup({
  products,
  productsReady,
  onDone,
}: {
  products: Record<string, ProductData>
  /** products.json settled — loaded or failed */
  productsReady: boolean
  onDone: () => void
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const started = useRef(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!productsReady || started.current) return
    started.current = true
    let cancelled = false

    ;(async () => {
      const debug = isDebug()

      if (Object.keys(products).length > 0) {
        const roots: THREE.Object3D[] = []
        scene.traverse((o) => {
          if (o.userData.isStoreVisualRoot) roots.push(o)
        })
        for (const root of roots) {
          const report = batchStaticMeshes(root, products)
          if (report && debug) console.info(`[StoreWarmup] batched ${report.before} → ${report.after} meshes`)
        }
      }

      await nextFrame()
      await nextFrame()
      if (cancelled) return

      const t0 = performance.now()
      try {
        await gl.compileAsync(scene, camera)
      } catch {
        // Worst case the programs compile on first draw, as they always did
      }
      if (cancelled) return

      const seen = new Set<THREE.Texture>()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) {
          const slots = mat as unknown as Record<string, unknown>
          for (const slot of TEXTURE_SLOTS) {
            const tex = slots[slot]
            if (tex instanceof THREE.Texture && !seen.has(tex)) {
              seen.add(tex)
              gl.initTexture(tex)
            }
          }
        }
      })
      if (debug) {
        console.info(
          `[StoreWarmup] ${gl.info.programs?.length ?? '?'} programs, ${seen.size} textures in ` +
            `${Math.round(performance.now() - t0)}ms`
        )
      }

      requestShadowUpdate()
      await nextFrame()
      await nextFrame()
      if (!cancelled) doneRef.current()
    })()

    return () => {
      cancelled = true
      started.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsReady])

  return null
}
