'use client'

import { useRef, useMemo, useEffect, useState, Suspense } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { useCarConfig, PaintZone, type MultiZonePaintConfig } from '@/stores/carConfigStore'
import { DynamicPart } from './DynamicPart'
import { PartErrorBoundary } from './PartErrorBoundary'
import { DoorController } from '@/lib/DoorController'
import { SuspensionController } from '@/lib/SuspensionController'
import { useQuality } from '@/contexts/QualityContext'
import { prepareCarObject } from '@/lib/three/prepareCarMaterial'
import { useCubeReflections } from '@/lib/three/useCubeReflections'
import * as THREE from 'three'

// Use the local DRACO decoder instead of drei's default CDN
useGLTF.setDecoderPath('/draco/')

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

interface ConfigurableCarProps {
  modelPath: string
  overrideSelectedParts?: Record<string, string>
  overridePaintConfig?: MultiZonePaintConfig
  overrideSuspensionHeight?: number
}

interface PaintTarget {
  material: THREE.MeshPhysicalMaterial
  zone: PaintZone
}

export default function ConfigurableCar({
  modelPath,
  overrideSelectedParts,
  overridePaintConfig,
  overrideSuspensionHeight,
}: ConfigurableCarProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const invalidate = useThree((s) => s.invalidate)
  const doorControllerRef = useRef<DoorController | null>(null)
  const suspensionControllerRef = useRef<SuspensionController | null>(null)
  const [wheelRefs, setWheelRefs] = useState<THREE.Object3D[]>([])

  const storePaintConfig = useCarConfig((s) => s.paintConfig)
  const paintInitialized = useCarConfig((s) => s.paintInitialized)
  const setPartError = useCarConfig((s) => s.setPartError)
  const openParts = useCarConfig((s) => s.openParts)
  const storeSelectedParts = useCarConfig((s) => s.selectedParts)
  const storeSuspensionHeight = useCarConfig((s) => s.suspensionHeight)
  const { settings } = useQuality()

  // Use overrides when provided, otherwise fallback to store values
  const paintConfig = overridePaintConfig ?? storePaintConfig
  const selectedParts = overrideSelectedParts ?? storeSelectedParts
  const suspensionHeight = overrideSuspensionHeight ?? storeSuspensionHeight

  const handlePartError = (category: string, error: Error) => {
    setPartError(category, error.message)
  }

  const gltf = useGLTF(modelPath)

  // Clone + center the car ONCE per model. Paintable materials are cloned here
  // (so we never mutate drei's shared cache) and collected for the paint effect.
  const { carModel, paintTargets } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    const targets: PaintTarget[] = []

    // Center model
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    clone.position.sub(center)

    const getUserData = (mesh: any, key: string) => {
      return mesh.userData?.userdata?.[key] ?? mesh.userData?.[key]
    }

    // Shadow flags + env boost for every surface (shared helper keeps swapped
    // parts visually in sync with the body)
    prepareCarObject(clone)

    // Collect paintable materials
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const paintableValue = getUserData(child, 'paintable')
        const isPaintable = paintableValue === true || paintableValue === 1
        const nameMatch =
          child.material?.name?.toLowerCase().includes('body') ||
          child.material?.name?.toLowerCase().includes('paint') ||
          child.name?.toLowerCase().includes('body')

        if (isPaintable || nameMatch) {
          const zone = (getUserData(child, 'paintZone') as PaintZone) || 'body'
          child.material = (child.material as THREE.Material).clone()
          targets.push({ material: child.material as THREE.MeshPhysicalMaterial, zone })
        }
      }
    })

    return { carModel: clone, paintTargets: targets }
  }, [gltf.scene])

  // Discover base wheels from the car model on initial load
  useEffect(() => {
    if (!carModel) return

    const baseWheelNames = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']
    const foundWheels: THREE.Object3D[] = []

    baseWheelNames.forEach((wheelName) => {
      const wheel = findNodeByName(carModel, wheelName)
      if (wheel) {
        console.log('[ConfigurableCar] Found base wheel:', wheelName)
        foundWheels.push(wheel)
      } else {
        console.warn('[ConfigurableCar] Base wheel not found:', wheelName)
      }
    })

    if (foundWheels.length > 0) {
      console.log('[ConfigurableCar] Initializing wheelRefs with', foundWheels.length, 'base wheels')
      setWheelRefs(foundWheels)
    }
  }, [carModel])

  // Paint transitions: first application is instant, later changes blend
  // smoothly (~400ms) in useFrame instead of snapping
  const firstPaintRef = useRef(true)
  const paintAnimatingRef = useRef(false)
  const paintScratchRef = useRef(new THREE.Color())

  useEffect(() => {
    // Skip paint application until user interacts with paint controls
    if (!paintInitialized) return

    // Static exotic-paint properties + instant first coat. Exotic paint
    // (iridescent color shift, glossy clearcoat) is exterior-only — interior
    // trim/leather must not color-shift at viewing angles.
    paintTargets.forEach(({ material, zone }) => {
      const zoneConfig = paintConfig[zone]
      const isInterior = zone === 'interior'
      if (material.clearcoat !== undefined && !isInterior) {
        material.clearcoatRoughness = 0.1
      }
      if (material.iridescence !== undefined) {
        material.iridescence = isInterior ? 0 : 0.3
        material.iridescenceIOR = 1.3
        material.iridescenceThicknessRange = [100, 800]
      }
      if (firstPaintRef.current) {
        material.color.set(zoneConfig.color)
        material.metalness = zoneConfig.metalness
        material.roughness = zoneConfig.roughness
        if (material.clearcoat !== undefined) material.clearcoat = zoneConfig.clearcoat
      }
    })
    if (firstPaintRef.current) {
      firstPaintRef.current = false
    } else {
      paintAnimatingRef.current = true
    }
    invalidate()
  }, [paintConfig, paintTargets, paintInitialized, invalidate])

  useFrame((_, delta) => {
    if (!paintAnimatingRef.current) return
    const d = 1 - Math.exp(-10 * delta) // ~400ms blend
    const scratch = paintScratchRef.current
    let moving = false
    paintTargets.forEach(({ material, zone }) => {
      const zoneConfig = paintConfig[zone]
      scratch.set(zoneConfig.color)
      material.color.lerp(scratch, d)
      material.metalness = THREE.MathUtils.damp(material.metalness, zoneConfig.metalness, 10, delta)
      material.roughness = THREE.MathUtils.damp(material.roughness, zoneConfig.roughness, 10, delta)
      if (material.clearcoat !== undefined) {
        material.clearcoat = THREE.MathUtils.damp(material.clearcoat, zoneConfig.clearcoat, 10, delta)
      }
      if (
        Math.abs(material.color.r - scratch.r) > 0.004 ||
        Math.abs(material.color.g - scratch.g) > 0.004 ||
        Math.abs(material.color.b - scratch.b) > 0.004 ||
        Math.abs(material.metalness - zoneConfig.metalness) > 0.004 ||
        Math.abs(material.roughness - zoneConfig.roughness) > 0.004
      ) {
        moving = true
      } else {
        material.color.copy(scratch)
        material.metalness = zoneConfig.metalness
        material.roughness = zoneConfig.roughness
        if (material.clearcoat !== undefined) material.clearcoat = zoneConfig.clearcoat
      }
    })
    if (moving) invalidate()
    else paintAnimatingRef.current = false
  })

  // Dispose the per-car cloned paint materials when the model changes/unmounts
  useEffect(() => {
    return () => {
      paintTargets.forEach(({ material }) => material.dispose())
    }
  }, [paintTargets])

  // Env intensity + anisotropic filtering follow quality settings
  useEffect(() => {
    if (!carModel) return
    prepareCarObject(carModel, {
      envMapIntensity: settings.envIntensity,
      anisotropy: settings.anisotropyLevel,
    })
    invalidate()
  }, [settings.envIntensity, settings.anisotropyLevel, carModel, invalidate])

  // True reflections (high/ultra): one-shot cube capture of floor + baked
  // ground shadow + studio env, applied as a real envMap on car materials.
  // Captures are frame-counted (not wall-clock) so they always land after
  // the ~50-frame shadow bake, however slow the GPU. The car is hidden in
  // its own capture, so paint changes never require one.
  const scheduleReflectionCapture = useCubeReflections(
    carModel,
    settings.cubeReflections,
    settings.cubeReflectionResolution
  )

  useEffect(() => {
    // Initial: alongside the first shadow bake
    scheduleReflectionCapture(60)
  }, [scheduleReflectionCapture])

  useEffect(() => {
    // Part swap: wait out the fade (~0.7s), then bake + capture
    const t = setTimeout(() => scheduleReflectionCapture(60), 950)
    return () => clearTimeout(t)
  }, [selectedParts, scheduleReflectionCapture])

  useEffect(() => {
    // Door/hood/trunk: wait out the animation (~1.2s), then bake + capture
    const t = setTimeout(() => scheduleReflectionCapture(60), 1450)
    return () => clearTimeout(t)
  }, [openParts, scheduleReflectionCapture])

  // Initialize DoorController after car model loads
  useEffect(() => {
    if (!carModel) return

    try {
      const controller = new DoorController(carModel, invalidate, {
        doorAngleDeg: 70,
        hoodAngleDeg: 45,
        trunkAngleDeg: 80,
        durationSec: 1.2,
      })
      doorControllerRef.current = controller
    } catch (error) {
      console.error('[ConfigurableCar] DoorController initialization failed:', error)
    }

    // Don't cleanup - keep controller alive for entire component lifecycle
  }, [carModel])

  // Initialize SuspensionController after group ref is ready
  useEffect(() => {
    if (!groupRef.current) return

    try {
      const controller = new SuspensionController(groupRef.current, invalidate, wheelRefs)
      suspensionControllerRef.current = controller
    } catch (error) {
      console.error('[ConfigurableCar] SuspensionController initialization failed:', error)
    }

    // Don't cleanup - keep controller alive for entire component lifecycle
  }, [groupRef.current])

  // React to openParts state changes
  useEffect(() => {
    if (!doorControllerRef.current) return

    const controller = doorControllerRef.current

    controller.openLeftFrontDoor(openParts.car_door_left)
    controller.openRightFrontDoor(openParts.car_door_right)
    controller.openLeftBackDoor(openParts.car_door_back_left)
    controller.openRightBackDoor(openParts.car_door_back_right)
    controller.openHood(openParts.car_caput)
    controller.openTrunk(openParts.car_trunk)
  }, [openParts])

  // React to suspension height changes
  useEffect(() => {
    if (!suspensionControllerRef.current) return
    suspensionControllerRef.current.setHeight(suspensionHeight)
  }, [suspensionHeight])

  // Update excluded nodes when wheel refs change
  useEffect(() => {
    if (!suspensionControllerRef.current) return
    console.log('[ConfigurableCar] Updating suspension excluded nodes with', wheelRefs.length, 'wheels')
    suspensionControllerRef.current.updateExcludedNodes(wheelRefs)
  }, [wheelRefs])

  // Reset to base wheels when "none" or hideNodes-only wheel selected
  useEffect(() => {
    const wheelPartId = selectedParts.wheels
    if (!carModel || !wheelPartId) return

    // If wheel part uses hideNodes only (like "wheel-none"), reset to base wheels
    if (wheelPartId.includes('none') || wheelPartId === '') {
      const baseWheelNames = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']
      const foundWheels: THREE.Object3D[] = []

      baseWheelNames.forEach((wheelName) => {
        const wheel = findNodeByName(carModel, wheelName)
        if (wheel) foundWheels.push(wheel)
      })

      if (foundWheels.length > 0) {
        console.log('[ConfigurableCar] Reset to base wheels:', foundWheels.length)
        setWheelRefs(foundWheels)
      }
    }
  }, [selectedParts.wheels, carModel])

  // Callback for when wheel parts are mounted
  const handleWheelMounted = (clones: THREE.Object3D[]) => {
    console.log('[ConfigurableCar] Wheel mounted callback received', clones.length, 'wheel clones')
    setWheelRefs(clones)
  }

  // Part categories to render
  const partCategories = [
    'wheels',
    'spoilers',
    'hoods',
    'bumpers',
    'mirrors',
    'exhaust',
    'side-skirts',
    'seats',
    'steering-wheels',
    'brake-calipers',
    'headlights',
  ]

  return (
    <group ref={groupRef}>
      <primitive object={carModel} />

      {/* Render dynamic parts for each category */}
      {partCategories.map((category) => (
        <Suspense key={category} fallback={null}>
          <PartErrorBoundary category={category} onError={handlePartError}>
            <DynamicPart
              category={category}
              baseCarScene={carModel}
              onMounted={category === 'wheels' ? handleWheelMounted : undefined}
            />
          </PartErrorBoundary>
        </Suspense>
      ))}
    </group>
  )
}
