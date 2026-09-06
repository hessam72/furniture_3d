'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useCarConfig } from '@/stores/carConfigStore'
import { useQuality } from '@/contexts/QualityContext'
import { prepareCarMaterial, type CarMaterialOptions } from '@/lib/three/prepareCarMaterial'
import * as THREE from 'three'
import partsConfig from '@/public/config/car-parts.json'

interface DynamicPartProps {
  category: string
  baseCarScene: THREE.Group
  onMounted?: (clones: THREE.Object3D[]) => void
}

// Transition-frame scratch — never allocate inside useFrame
const _scaleFrom = new THREE.Vector3()
const _unitScale = new THREE.Vector3(1, 1, 1)

// Helper: Find node by name (case-insensitive, recursive)
function findNodeByName(parent: THREE.Object3D, name: string): THREE.Object3D | null {
  if (parent.name.toLowerCase() === name.toLowerCase()) {
    return parent
  }
  for (const child of parent.children) {
    const found = findNodeByName(child, name)
    if (found) return found
  }
  return null
}

// Helper: Check if object is a Group (contains children but is not a Mesh itself)
// Groups are common in 3D models - e.g., Wheel_FL contains brake disc, tire, rim, etc.
function isGroup(obj: THREE.Object3D): boolean {
  return obj.type === 'Group' || (obj.children.length > 0 && !(obj instanceof THREE.Mesh))
}

// Helper: Count meshes in an object (handles both single Meshes and Groups)
function countMeshes(obj: THREE.Object3D): number {
  let count = 0
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) count++
  })
  return count
}

// Hide the given nodes, returning the ones that were visible so callers can restore them
function hideNodes(baseCarScene: THREE.Object3D, names: string[]): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = []
  names.forEach((nodeName) => {
    const node = findNodeByName(baseCarScene, nodeName)
    if (node) {
      if (node.visible) {
        node.visible = false
        hidden.push(node)
      }
    } else {
      console.warn(`[DynamicPart] node not found: ${nodeName}`)
    }
  })
  return hidden
}

// Clone a part for placement. Geometries stay shared with the drei cache;
// materials are cloned per instance so fade transitions never touch the cache.
// Handles both single Meshes and Groups containing multiple meshes.
function clonePartAt(
  gltfScene: THREE.Object3D,
  targetNode: THREE.Object3D,
  matOptions: CarMaterialOptions
): THREE.Object3D {
  const clone = gltfScene.clone(true)

  clone.position.copy(targetNode.position)
  clone.quaternion.copy(targetNode.quaternion)
  clone.scale.copy(targetNode.scale)

  // Store original scale for animation
  clone.userData.originalScale = targetNode.scale.clone()

  // Log if this is a Group structure
  if (isGroup(clone)) {
    const meshCount = countMeshes(clone)
    console.log(`[DynamicPart] Cloning Group "${clone.name}" (${clone.children.length} children, ${meshCount} meshes)`)
  }

  // Per-clone materials, initialized for the fade-in transition. depthWrite
  // stays off while translucent so old/new parts don't occlude each other
  // mid-fade; finalizeFadedMaterials restores opaque state afterwards.
  // traverse() recursively processes all meshes regardless of Group structure.
  clone.traverse((child: any) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = (child.material as THREE.Material).clone() as THREE.MeshStandardMaterial
      mat.transparent = true
      mat.opacity = 0
      mat.depthWrite = false
      prepareCarMaterial(mat, matOptions)
      child.material = mat
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  return clone
}

// After the fade-in completes, return materials to opaque state — leaving
// transparent:true causes alpha-sorting/depth artifacts against the body
function finalizeFadedMaterials(part: THREE.Object3D) {
  part.traverse((child: any) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material as THREE.MeshStandardMaterial
      mat.opacity = 1
      mat.transparent = false
      mat.depthWrite = true
      mat.needsUpdate = true
    }
  })
}

// Re-arm previously finalized (opaque) materials so a fade-out can animate
function armMaterialsForFade(part: THREE.Object3D) {
  part.traverse((child: any) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material as THREE.MeshStandardMaterial
      mat.transparent = true
      mat.depthWrite = false
      mat.needsUpdate = true
    }
  })
}

// Dispose only what we own: the cloned materials. Geometries belong to the drei cache.
function disposeClone(clone: THREE.Object3D) {
  clone.parent?.remove(clone)
  clone.traverse((child: any) => {
    if (child instanceof THREE.Mesh) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat: any) => mat.dispose())
      } else {
        child.material?.dispose()
      }
    }
  })
}

// Reports part-loading state while the part GLB suspends
function LoadingFlag({ category }: { category: string }) {
  const setPartLoading = useCarConfig((s) => s.setPartLoading)
  useEffect(() => {
    setPartLoading(category, true)
    return () => setPartLoading(category, false)
  }, [category, setPartLoading])
  return null
}

export function DynamicPart({ category, baseCarScene, onMounted }: DynamicPartProps) {
  const selectedPartId = useCarConfig((s) => s.selectedParts[category])
  const invalidate = useThree((s) => s.invalidate)

  const parts = partsConfig[category as keyof typeof partsConfig] || []
  const partConfig: any = parts.find((p: any) => p.id === selectedPartId)

  // Strategy 1: hideNodes only (e.g., "None" options) — no model to load
  useEffect(() => {
    if (!partConfig || partConfig.model_path || !partConfig.hideNodes) return
    const hidden = hideNodes(baseCarScene, partConfig.hideNodes)
    invalidate()
    return () => {
      hidden.forEach((node) => (node.visible = true))
      invalidate()
    }
  }, [partConfig, baseCarScene, invalidate])

  // useGLTF must be called unconditionally, so model-backed parts live in a
  // child component that only mounts when a model path exists
  if (!partConfig?.model_path) return null

  return (
    <Suspense fallback={<LoadingFlag category={category} />}>
      <ModeledPart category={category} partConfig={partConfig} baseCarScene={baseCarScene} onMounted={onMounted} />
    </Suspense>
  )
}

interface ModeledPartProps {
  category: string
  partConfig: any
  baseCarScene: THREE.Group
  onMounted?: (clones: THREE.Object3D[]) => void
}

function ModeledPart({ category, partConfig, baseCarScene, onMounted }: ModeledPartProps) {
  const setPartLoading = useCarConfig((s) => s.setPartLoading)
  const setPartError = useCarConfig((s) => s.setPartError)
  const invalidate = useThree((s) => s.invalidate)
  const { settings } = useQuality()
  const matOptions: CarMaterialOptions = {
    envMapIntensity: settings.envIntensity,
    anisotropy: settings.anisotropyLevel,
  }

  // Track transition state
  const transitionRef = useRef<{
    oldParts: THREE.Object3D[]
    newParts: THREE.Object3D[]
    progress: number
    isTransitioning: boolean
  }>({
    oldParts: [],
    newParts: [],
    progress: 0,
    isTransitioning: false
  })

  // Suspends until loaded; cached by drei so reselecting a part is instant
  const gltf: any = useGLTF(partConfig.model_path)

  useEffect(() => {
    setPartLoading(category, false)
    setPartError(category, null)
  }, [gltf, category, setPartLoading, setPartError])

  // Animate transitions
  useFrame((_, delta) => {
    const transition = transitionRef.current
    if (!transition.isTransitioning) return

    // Keep frames coming while animating (frameloop="demand")
    invalidate()

    // Wait 1-2 frames before animating to ensure initial state renders
    if (transition.progress < 0) {
      transition.progress = Math.min(0, transition.progress + delta * 3.0)
      return
    }

    transition.progress += delta * 1.5 // ~667ms duration

    if (transition.progress >= 1) {
      // Transition complete
      transition.progress = 1
      transition.isTransitioning = false

      transition.oldParts.forEach(disposeClone)
      transition.oldParts = []

      // Restore opaque materials — transparency was only for the fade
      transition.newParts.forEach(finalizeFadedMaterials)
      invalidate()
      return
    }

    // Animate opacity and scale
    const fadeProgress = Math.min(1, transition.progress * 1.5) // Faster fade

    // Fade out old parts
    transition.oldParts.forEach((part) => {
      part.traverse((child: any) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material.opacity = 1 - fadeProgress
        }
      })
    })

    // Fade in new parts with scale animation
    transition.newParts.forEach((part) => {
      const scaleProgress = Math.pow(fadeProgress, 0.5) // Ease-out scale
      const targetScale: THREE.Vector3 = part.userData.originalScale || _unitScale
      _scaleFrom.set(0.6, 0.6, 0.6).multiply(targetScale)
      part.scale.lerpVectors(_scaleFrom, targetScale, scaleProgress)

      part.traverse((child: any) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material.opacity = fadeProgress
        }
      })
    })
  })

  // Process part placement - add directly to baseCarScene
  useEffect(() => {
    const addedClones: THREE.Object3D[] = []
    const hiddenNodes: THREE.Object3D[] = []
    const transition = transitionRef.current

    // Store old parts for fade-out transition (their materials were finalized
    // to opaque after the last fade, so re-arm them for animating opacity)
    if (transition.newParts.length > 0) {
      transition.oldParts = [...transition.newParts]
      transition.oldParts.forEach(armMaterialsForFade)
    }

    // Strategy 2: attachNodes (multiple instances, e.g., wheels)
    if (partConfig.attachNodes) {
      partConfig.attachNodes.forEach((nodeName: string) => {
        const targetNode = findNodeByName(baseCarScene, nodeName)
        if (!targetNode) {
          console.warn(`[DynamicPart] attachNode not found: ${nodeName}`)
          return
        }

        const nodeType = isGroup(targetNode) ? 'Group' : targetNode.type
        console.log(`[DynamicPart] Attaching to "${nodeName}" (${nodeType})`)

        const clone = clonePartAt(gltf.scene, targetNode, matOptions)

        // Add to same parent to maintain coordinate space
        targetNode.parent?.add(clone)
        addedClones.push(clone)

        // Hide original node (works for both Groups and Meshes)
        if (targetNode.visible) {
          targetNode.visible = false
          hiddenNodes.push(targetNode)
        }
      })

      if (partConfig.hideNodes) {
        hiddenNodes.push(...hideNodes(baseCarScene, partConfig.hideNodes))
      }
    }

    // Strategy 3: replaceNode (single instance, e.g., hood)
    if (partConfig.replaceNode) {
      const targetNode = findNodeByName(baseCarScene, partConfig.replaceNode)
      if (!targetNode) {
        console.warn(`[DynamicPart] replaceNode not found: ${partConfig.replaceNode}`)
        return
      }

      const nodeType = isGroup(targetNode) ? 'Group' : targetNode.type
      console.log(`[DynamicPart] Replacing "${partConfig.replaceNode}" (${nodeType})`)

      const clone = clonePartAt(gltf.scene, targetNode, matOptions)

      // Add to same parent to maintain coordinate space
      targetNode.parent?.add(clone)
      addedClones.push(clone)

      // Hide original node (works for both Groups and Meshes)
      if (targetNode.visible) {
        targetNode.visible = false
        hiddenNodes.push(targetNode)
      }
    }

    // Start transition animation with frame delay
    transition.newParts = addedClones
    transition.progress = -0.1 // Start negative for 2-frame delay
    transition.isTransitioning = addedClones.length > 0

    // Notify parent of mounted clones (e.g., for suspension controller)
    if (onMounted && addedClones.length > 0) {
      console.log('[DynamicPart] Calling onMounted callback for category:', category, 'with', addedClones.length, 'clones')
      onMounted(addedClones)
    }

    invalidate()

    // Cleanup - called when component unmounts or dependencies change
    return () => {
      const allParts = [...transition.oldParts, ...transition.newParts]
      allParts.forEach(disposeClone)

      // Restore nodes this part hid, so switching selections can't strand them
      hiddenNodes.forEach((node) => (node.visible = true))

      // Reset transition state
      transition.oldParts = []
      transition.newParts = []
      transition.isTransitioning = false
      invalidate()
    }
  }, [gltf, partConfig, baseCarScene, invalidate])

  return null
}
