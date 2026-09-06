'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AccumulativeShadows, RandomizedLight, ContactShadows } from '@react-three/drei'
import { useCarConfig } from '@/stores/carConfigStore'
import { useQuality } from '@/contexts/QualityContext'

// ReflectiveFloor sits at y=-0.9; shadow catcher floats just above it
const SHADOW_Y = -0.89
const BAKE_FRAMES = 45

/**
 * Ground contact for the car. Low/Medium: cheap blurred ContactShadows that
 * track every rendered frame. High/Ultra: temporally accumulated soft shadows
 * (area-light quality), baked once and re-baked when the car's geometry
 * changes (part swaps, doors) — camera moves never trigger re-bakes.
 */
export default function CarGroundShadows() {
  const { settings } = useQuality()

  // userData.photoModeHide: the path tracer computes real ground shadows,
  // so these raster shadow catchers are hidden during photo mode
  if (settings.groundShadows === 'accumulative') {
    return (
      <group userData={{ photoModeHide: true }}>
        <AccumulativeGroundShadows key={settings.groundShadowResolution} />
      </group>
    )
  }

  return (
    <group userData={{ photoModeHide: true }}>
      <OnChangeContactShadows resolution={settings.groundShadowResolution} />
    </group>
  )
}

/**
 * ContactShadows normally re-renders scene-from-below + blur on every frame —
 * pure waste while orbiting a static car. frames={160} renders only the first
 * 160 invalidated frames after (re)mount (covers a 1.2s door animation at
 * 120Hz), and the key remount on part/door changes re-runs it exactly when
 * geometry moves — frames only tick on frames the animation itself
 * invalidates.
 */
function OnChangeContactShadows({ resolution }: { resolution: number }) {
  const selectedParts = useCarConfig((s) => s.selectedParts)
  const openParts = useCarConfig((s) => s.openParts)
  const generation = useMemo(
    () => JSON.stringify(selectedParts) + JSON.stringify(openParts),
    [selectedParts, openParts]
  )

  return (
    <ContactShadows
      key={generation}
      frames={160}
      position={[0, SHADOW_Y, 0]}
      opacity={0.7}
      scale={12}
      blur={2.2}
      far={3}
      resolution={resolution}
      color="#000000"
    />
  )
}

function AccumulativeGroundShadows() {
  const { settings } = useQuality()
  const shadowsRef = useRef<any>(null)
  const pendingFramesRef = useRef(0)
  const invalidate = useThree((s) => s.invalidate)

  const selectedParts = useCarConfig((s) => s.selectedParts)
  const openParts = useCarConfig((s) => s.openParts)

  // frameloop="demand": keep frames coming until accumulation completes
  useFrame(() => {
    if (pendingFramesRef.current > 0) {
      pendingFramesRef.current -= 1
      invalidate()
    }
  })

  const startBake = () => {
    shadowsRef.current?.reset?.()
    pendingFramesRef.current = BAKE_FRAMES + 5
    invalidate()
  }
  const startBakeRef = useRef(startBake)
  startBakeRef.current = startBake

  // Initial bake — the Canvas-level Suspense means we mount alongside the
  // loaded car, so the first accumulation already sees it
  useEffect(() => {
    startBakeRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Part swaps: wait for the ~0.7s fade transition to finish, then re-bake
  useEffect(() => {
    const t = setTimeout(() => startBakeRef.current(), 900)
    return () => clearTimeout(t)
  }, [selectedParts])

  // Doors/hood/trunk: wait for the ~1.2s open/close animation, then re-bake
  useEffect(() => {
    const t = setTimeout(() => startBakeRef.current(), 1400)
    return () => clearTimeout(t)
  }, [openParts])

  return (
    <AccumulativeShadows
      ref={shadowsRef}
      temporal
      frames={BAKE_FRAMES}
      alphaTest={0.8}
      opacity={0.85}
      scale={14}
      position={[0, SHADOW_Y, 0]}
      resolution={settings.groundShadowResolution}
    >
      <RandomizedLight
        amount={8}
        radius={4}
        ambient={0.6}
        intensity={1}
        position={[5, 8, -3]}
        bias={0.001}
        mapSize={settings.groundShadowResolution}
        size={14}
      />
    </AccumulativeShadows>
  )
}
