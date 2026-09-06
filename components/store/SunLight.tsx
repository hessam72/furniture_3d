'use client'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useQuality } from '@/contexts/QualityContext'
import type { PartialSun, SunConfig } from './hooks/useStoreConfig'
import { SunDebug } from './SunDebug'

// Code-side fallback so a store may specify only the fields it wants to
// override. Bounds/bias mirror the proven /car values (CarLighting.tsx).
export const DEFAULT_SUN: SunConfig = {
  enabled: false,
  position: [8, 7, -6],
  target: [0, 0.5, 0],
  intensity: 20,
  color: '#ffe3c2',
  soft: { size: 20, samples: 16, focus: 0 },
  shadow: { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 45, bias: -0.0001, normalBias: 0.03 },
}

function mergeSun(base: SunConfig, over?: PartialSun | null): SunConfig {
  if (!over) return base
  return {
    enabled: over.enabled ?? base.enabled,
    position: (over.position as [number, number, number]) ?? base.position,
    target: (over.target as [number, number, number]) ?? base.target,
    intensity: over.intensity ?? base.intensity,
    color: over.color ?? base.color,
    soft: { ...base.soft, ...over.soft },
    shadow: { ...base.shadow, ...over.shadow },
  }
}

const sunDebugRequested = () =>
  process.env.NODE_ENV === 'development' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('sundebug') === '1'

/**
 * "Sun through a window" directional light. The window's shape is
 * carved in the GLB by the user; this light shines from outside through it and
 * the shadow lands on the floor/GLB. Position/target/bounds are config-driven
 * (stores.json, or furniture-presentation.json on /product) and re-tunable live
 * with ?sundebug=1 on either page.
 *
 * The orthographic shadow box MUST enclose the whole salon: drei SoftShadows
 * (PCSS) early-returns fully-lit for any fragment outside it, so an undersized
 * box leaks sunlight through walls.
 */
export function SunLight({ sun }: { sun?: PartialSun }) {
  const invalidate = useThree((s) => s.invalidate)
  const { settings } = useQuality()
  const res = settings.shadowResolution

  // Dev-helper live edits fully replace the config-merged value
  const [override, setOverride] = useState<SunConfig | null>(null)
  const cfg = useMemo(() => override ?? mergeSun(DEFAULT_SUN, sun), [override, sun])

  const lightRef = useRef<THREE.DirectionalLight>(null)
  const shadowCamRef = useRef<THREE.OrthographicCamera>(null)
  const targetObj = useMemo(() => new THREE.Object3D(), [])
  const prevRes = useRef(res)

  // Stable initial args so R3F never reconstructs the shadow camera (keeps the
  // light.shadow.camera reference alive for the dev CameraHelper); bounds are
  // then driven imperatively below.
  const initialArgs = useRef<[number, number, number, number, number, number]>([
    cfg.shadow.left, cfg.shadow.right, cfg.shadow.top, cfg.shadow.bottom, cfg.shadow.near, cfg.shadow.far,
  ])

  useLayoutEffect(() => {
    const cam = shadowCamRef.current
    if (cam) {
      cam.left = cfg.shadow.left
      cam.right = cfg.shadow.right
      cam.top = cfg.shadow.top
      cam.bottom = cfg.shadow.bottom
      cam.near = cfg.shadow.near
      cam.far = cfg.shadow.far
      cam.updateProjectionMatrix()
    }
    // three never resizes an existing shadow FBO — drop it so it rebuilds at
    // the new tier resolution (same latent quirk as CarLighting.tsx:43-44).
    const light = lightRef.current
    if (light && prevRes.current !== res) {
      prevRes.current = res
      const shadow = light.shadow as unknown as { map: THREE.WebGLRenderTarget | null }
      shadow.map?.dispose()
      shadow.map = null
    }
    invalidate()
  }, [cfg, res, invalidate])

  if (!cfg.enabled) return null

  return (
    <>
      <directionalLight
        ref={lightRef}
        castShadow
        position={cfg.position}
        intensity={cfg.intensity}
        color={cfg.color}
        target={targetObj}
        shadow-mapSize-width={res}
        shadow-mapSize-height={res}
        shadow-bias={cfg.shadow.bias}
        shadow-normalBias={cfg.shadow.normalBias}
      >
        <orthographicCamera ref={shadowCamRef} attach="shadow-camera" args={initialArgs.current} />
      </directionalLight>
      {/* Target must live in the graph so its world matrix (light direction) updates */}
      <primitive object={targetObj} position={cfg.target} />
      {sunDebugRequested() && (
        <SunDebug lightRef={lightRef} camRef={shadowCamRef} cfg={cfg} onChange={setOverride} />
      )}
    </>
  )
}
