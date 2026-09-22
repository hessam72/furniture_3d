'use client'
import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { useLoader } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { useQuality } from '@/contexts/QualityContext'
import { applyAnisotropy } from '@/lib/three/prepareCarMaterial'
import { extendGltfLoader } from '@/lib/three/gltfLoaders'
import { disposeStaticBatches } from '@/lib/store/staticBatch'
import { isDebug } from '@/components/three/rendererStatsStore'
import type { ModelFile } from './hooks/useStoreConfig'
import { requestShadowUpdate } from './staticShadows'

/** The collision proxy's layer — tested by neither the camera nor a raycaster. */
export const COLLIDER_LAYER = 31

// DRACO, KTX2 and meshopt all live in lib/three/gltfLoaders — the
// one-shared-decoder rule this file introduced, now applied app-wide and
// extended to the transcoder. This path does not go through drei, so what
// `extendGltfLoader` does not set, nothing does. @see extendGltfLoader

type ModelLoaderProps = {
  files: ModelFile[]
  onModelsLoaded?: () => void
  onProgress?: (loaded: number) => void
}

export function ModelLoader({ files, onModelsLoaded, onProgress }: ModelLoaderProps) {
  const [loadedCount, setLoadedCount] = useState(0)

  // Sort by priority (0 = wireframe first)
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => a.priority - b.priority)
  }, [files])

  const handleModelLoaded = useCallback(() => {
    setLoadedCount(prev => {
      const newCount = prev + 1
      onProgress?.(newCount)
      return newCount
    })
  }, [onProgress])

  useEffect(() => {
    if (loadedCount >= sortedFiles.length && loadedCount > 0) {
      onModelsLoaded?.()
    }
  }, [loadedCount, sortedFiles.length, onModelsLoaded])

  return (
    <>
      {sortedFiles.map((file, idx) => (
        <Model
          key={file.url}
          url={file.url}
          isWireframe={file.priority === 0}
          onLoaded={handleModelLoaded}
        />
      ))}
    </>
  )
}



type ModelProps = {
  url: string
  isWireframe: boolean
  onLoaded?: () => void
}

function Model({ url, isWireframe, onLoaded }: ModelProps) {
  // Texture sharpening follows the shared quality tier (4/4/8/16)
  const { settings, device } = useQuality()
  // Read at clone time, not a dependency: a device-class flip must not
  // re-clone the room (it would come back unbatched, batches leaked)
  const touchRef = useRef(device !== 'desktop')
  touchRef.current = device !== 'desktop'

  // Draco/meshopt for geometry, KTX2 for textures — the store's room GLB is
  // whatever scripts/optimize-glb.sh last wrote to /ktx-optimized.
  const gltf = useLoader(GLTFLoader, url, extendGltfLoader)

  useEffect(() => {
    if (gltf && onLoaded) {
      onLoaded()
    }
  }, [gltf, onLoaded])

  const clonedScene = useMemo(() => {
    const clone = gltf.scene.clone(true)

    // Tag wireframe for physics system; visual roots for StoreWarmup's batching
    if (isWireframe) {
      clone.userData.isWireframeCollision = true
    } else {
      clone.userData.isStoreVisualRoot = true
    }
    let transmissive = 0
    const touch = touchRef.current

    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (isWireframe) {
          // Collision proxy: Rapier builds the collider from it, nothing
          // else should ever see it. It used to be drawn every frame at
          // opacity 0 — full geometry, blended, for no pixels — and was the
          // first thing a tap's raycast hit. A layer the camera and raycaster
          // never test takes it out of both, while it stays `visible` for
          // Rapier's `traverseVisible` collider walk.
          obj.layers.set(COLLIDER_LAYER)
          obj.castShadow = false
          obj.receiveShadow = false
        } else {
          // Visual models: visible with shadows
          obj.castShadow = true
          obj.receiveShadow = true

          // Glass window panes must NOT cast — the shadow depth pass is
          // alpha-blind, so a pane would black out the whole sun patch. Any
          // other window mesh (frames/mullions) keeps casting and paints the
          // window pattern on the floor. GLB naming contract: name panes *glass*.
          if (obj.name.toLowerCase().includes('glass')) {
            obj.castShadow = false
          }

          if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            materials.forEach((mat) => {
              mat.envMapIntensity = 1
              // Cast from both faces so thin single-plane walls / window frames
              // are reliable regardless of GLB winding (affects depth pass only;
              // mat.side / the ceiling DoubleSide rule below are untouched).
              mat.shadowSide = THREE.DoubleSide
              // Transmission (glTF KHR_materials_transmission — Blender glass)
              // makes three re-render every opaque object into a mipmapped
              // transmission target, every frame, for the one pane drawn with
              // it. On touch a thin pane reads the same as plain alpha over
              // what is behind it, at none of the cost.
              if (touch && mat instanceof THREE.MeshPhysicalMaterial && mat.transmission > 0) {
                mat.opacity = Math.min(mat.opacity, 1 - 0.7 * mat.transmission)
                mat.transmission = 0
                mat.transparent = true
                mat.depthWrite = false
                transmissive++
              }
              mat.needsUpdate = true
            })
          }

          // Ceiling double-sided rendering for reflections
          if (obj.name.toLowerCase().includes('ceiling') || obj.position.y > 3) {
            if (obj.material) {
              const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
              materials.forEach((mat) => {
                mat.side = THREE.DoubleSide
                mat.needsUpdate = true
              })
            }
          }

          // Lamp fixtures: tag as an anchor for LampLights (which drops a real
          // point light at each + sets the shade's emissive glow). castShadow
          // off so a shadow-casting lamp can't occlude its own bulb, and so the
          // glowing shade doesn't throw a hard sun shadow. Naming contract:
          // one mesh per fixture named *lamp*; avoid *light*/*glass*/*ceiling*.
          if (obj.name.toLowerCase().includes('lamp')) {
            obj.userData.isLamp = true
            obj.castShadow = false
          }

          // String light emissive glow
          if (obj.name.toLowerCase().includes('light') && obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((mat) => {
                mat.emissive = new THREE.Color('#f6ffc4')
                mat.emissiveIntensity = 2
                mat.needsUpdate = true
              })
            } else {
              obj.material.emissive = new THREE.Color('#f6ffc4')
              obj.material.emissiveIntensity = 2
              obj.material.needsUpdate = true
            }
          }
        }
      }
    })

    if (transmissive && isDebug()) {
      console.info(`[ModelLoader] ${url}: ${transmissive} transmissive material(s) → alpha on touch`)
    }

    // Auto-center on Y=0 (only for visual models)
    if (!isWireframe) {
      const box = new THREE.Box3().setFromObject(clone)
      const yOffset = -box.min.y
      clone.position.y = yOffset
    }

    return clone
  }, [gltf.scene, isWireframe, url])

  // A new clone in the scene is new geometry for the (frozen) shadow maps;
  // its merged batches (StoreWarmup) go with it
  useEffect(() => {
    if (isWireframe) return
    requestShadowUpdate()
    return () => disposeStaticBatches(clonedScene)
  }, [clonedScene, isWireframe])

  // Texture anisotropy follows the quality tier without re-cloning the model
  useEffect(() => {
    if (isWireframe) return
    clonedScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => applyAnisotropy(mat, settings.anisotropyLevel))
      }
    })
  }, [clonedScene, isWireframe, settings.anisotropyLevel])

  if (isWireframe) {
    return (
      <RigidBody type="fixed" colliders="trimesh" friction={1}>
        <primitive object={clonedScene} />
      </RigidBody>
    )
  }

  return <primitive object={clonedScene} />
}
