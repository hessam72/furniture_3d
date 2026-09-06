'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { WebGLPathTracer } from 'three-gpu-pathtracer'
import { usePhotoMode } from '@/stores/photoModeStore'

const MAX_SAMPLES = 250

/**
 * The active path-traced session. Lives in its own chunk (React.lazy in
 * PhotoMode) so three-gpu-pathtracer + three-mesh-bvh stay out of the
 * initial /car bundle and only download when photo mode is opened.
 */
export default function PhotoModeSession() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const set = useThree((s) => s.set)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let disposed = false
    let rafId = 0
    const { setStatus, setSamples, clearSaveRequest } = usePhotoMode.getState()

    // The path tracer owns the canvas while photo mode is active
    set({ frameloop: 'never' })

    // Hide raster-only shadow catchers (accumulative/contact planes) — the
    // path tracer computes real ground shadows itself
    const hidden: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj.userData?.photoModeHide && obj.visible) {
        obj.visible = false
        hidden.push(obj)
      }
    })

    const pt = new WebGLPathTracer(gl)
    pt.bounces = 8
    pt.filterGlossyFactor = 0.5
    pt.renderScale = 1
    pt.tiles.set(3, 3)
    pt.renderToCanvas = true

    setStatus('building', 0)
    pt.setSceneAsync(scene, camera, {
      onProgress: (p: number) => {
        if (!disposed) setStatus('building', p)
      },
    }).then(() => {
      if (disposed) return
      setStatus('rendering')
      const loop = () => {
        if (disposed) return
        pt.renderSample()
        setSamples(pt.samples)
        if (pt.samples < MAX_SAMPLES) rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)
    })

    // Save: render one sample and read the canvas back in the same tick
    // (works without preserveDrawingBuffer)
    const unsubscribe = usePhotoMode.subscribe((state, prev) => {
      if (state.saveRequested && !prev.saveRequested && !disposed) {
        pt.renderSample()
        const url = gl.domElement.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = url
        a.download = `car-photo-${Date.now()}.png`
        a.click()
        clearSaveRequest()
      }
    })

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      unsubscribe()
      hidden.forEach((obj) => (obj.visible = true))
      pt.dispose()
      set({ frameloop: 'demand' })
      const { setStatus: resetStatus, setSamples: resetSamples } = usePhotoMode.getState()
      resetStatus('idle')
      resetSamples(0)
      invalidate()
    }
  }, [gl, scene, camera, set, invalidate])

  return null
}
