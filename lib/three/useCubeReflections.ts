'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Stand-in for the reflective floor during cube captures (matches its color)
let captureFloorMaterial: THREE.MeshStandardMaterial | null = null
function getCaptureFloorMaterial() {
  if (!captureFloorMaterial) {
    captureFloorMaterial = new THREE.MeshStandardMaterial({
      color: '#3f3d39',
      roughness: 1,
      metalness: 0.6,
    })
  }
  return captureFloorMaterial
}

/**
 * True reflections for the car: a one-shot CubeCamera capture of the scene
 * (reflective floor, baked ground shadow, studio environment) assigned as a
 * real envMap to every car material. The car hides itself during capture and
 * scene.background is temporarily set to the environment texture so paint
 * reflects the light rig too.
 *
 * Returns `scheduleCapture(afterFrames)`: the capture runs after N *rendered*
 * frames rather than a wall-clock delay, so it always lands after the
 * accumulative shadow bake (~50 driven frames) finishes — regardless of GPU
 * speed. The hook drives the demand loop itself while a capture is pending.
 * Paint color changes never need a re-capture since the car is not part of
 * its own capture.
 */
export function useCubeReflections(
  carRoot: THREE.Object3D | null,
  enabled: boolean,
  resolution: number
) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const rigRef = useRef<{ rt: THREE.WebGLCubeRenderTarget; cam: THREE.CubeCamera } | null>(null)
  const pendingFramesRef = useRef(-1)

  useEffect(() => {
    if (!enabled || !carRoot) return
    const rt = new THREE.WebGLCubeRenderTarget(resolution, { type: THREE.HalfFloatType })
    const cam = new THREE.CubeCamera(0.5, 60, rt)
    cam.position.set(0, 0.6, 0) // roughly paint-surface height at car center
    rigRef.current = { rt, cam }

    return () => {
      pendingFramesRef.current = -1
      // Detach from materials before disposing so they fall back to scene env
      carRoot.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach((m: THREE.Material | null) => {
            const std = m as THREE.MeshStandardMaterial | null
            if (std && std.envMap === rt.texture) {
              std.envMap = null
              std.needsUpdate = true
            }
          })
        }
      })
      rt.dispose()
      rigRef.current = null
      invalidate()
    }
  }, [enabled, resolution, carRoot, invalidate])

  const capture = useCallback(() => {
    const rig = rigRef.current
    if (!rig || !carRoot || !enabled) return

    const prevVisible = carRoot.visible
    const prevBackground = scene.background
    carRoot.visible = false
    scene.background = scene.environment

    // The live MeshReflectorMaterial re-renders the whole scene per cube
    // face (6× spike). Swap the floor to a plain dark material for the
    // capture — indistinguishable inside a rough paint reflection.
    const floor = scene.getObjectByName('reflective-floor') as THREE.Mesh | undefined
    const prevFloorMaterial = floor?.material
    if (floor) floor.material = getCaptureFloorMaterial()

    rig.cam.update(gl, scene)
    // Force PMREM regeneration so rough materials pick up the new capture
    rig.rt.texture.needsPMREMUpdate = true

    if (floor && prevFloorMaterial) floor.material = prevFloorMaterial
    carRoot.visible = prevVisible
    scene.background = prevBackground

    carRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m: THREE.Material | null) => {
          const std = m as THREE.MeshStandardMaterial | null
          if (std && 'envMap' in std && std.envMap !== rig.rt.texture) {
            std.envMap = rig.rt.texture
            std.needsUpdate = true
          }
        })
      }
    })
    invalidate()
  }, [carRoot, enabled, gl, scene, invalidate])

  // Count down rendered frames, keep the demand loop alive, capture at zero
  useFrame(() => {
    if (pendingFramesRef.current < 0) return
    if (pendingFramesRef.current === 0) {
      pendingFramesRef.current = -1
      capture()
      return
    }
    pendingFramesRef.current -= 1
    invalidate()
  })

  return useCallback(
    (afterFrames = 60) => {
      if (!enabled) return
      pendingFramesRef.current = afterFrames
      invalidate()
    },
    [enabled, invalidate]
  )
}
