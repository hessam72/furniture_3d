'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useQuality } from '@/contexts/QualityContext'
import type { LampConfig, StoreConfig } from './hooks/useStoreConfig'
import { markStoreActivity } from './activityGovernor'

type PartialLamp = StoreConfig['lamps']

// Code-side fallback so a store may override only the fields it cares about.
export const DEFAULT_LAMP: LampConfig = {
  enabled: false,
  color: '#ffd6aa',
  intensity: 20,
  distance: 6,
  decay: 2,
  offsetY: -0.15,
  emissiveIntensity: 2.5,
  shadowMapSize: 512,
  bias: -0.005,
  normalBias: 0.02,
}

function mergeLamp(base: LampConfig, over?: PartialLamp | null): LampConfig {
  if (!over) return base
  return { ...base, ...over } as LampConfig
}

const lampDebugRequested = () =>
  process.env.NODE_ENV === 'development' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('lampdebug') === '1'

/** Warm emissive glow on the shade (feeds Bloom) — single or array material */
function applyEmissive(material: THREE.Material | THREE.Material[], color: string, intensity: number) {
  const mats = Array.isArray(material) ? material : [material]
  mats.forEach((mat) => {
    const m = mat as THREE.MeshStandardMaterial
    if ('emissive' in m) {
      m.emissive = new THREE.Color(color)
      m.emissiveIntensity = intensity
      m.needsUpdate = true
    }
  })
}

/**
 * Turns every GLB mesh tagged `userData.isLamp` (name contains "lamp", set in
 * ModelLoader) into a realistic lamp: a warm emissive shade + a real point
 * light at its position. Anchors are read from the *live* scene graph (after
 * the model's Y auto-center), so this needs no knowledge of GLB internals.
 *
 * Tiering: emissive glow is always applied (cheap, all tiers incl. low). Real
 * point lights are gated by settings.lampLights and capped by lampMaxLights;
 * the first lampShadowCasters lamps cast a native cube-PCF shadow (drei's PCSS
 * only patches directional/spot getShadow — point lights are unaffected).
 */
export function LampLights({
  active,
  revision,
  config,
}: {
  active: boolean
  revision: number
  config: PartialLamp
}) {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const { settings } = useQuality()

  const [override, setOverride] = useState<LampConfig | null>(null)
  const cfg = useMemo(() => override ?? mergeLamp(DEFAULT_LAMP, config), [override, config])

  const [anchors, setAnchors] = useState<THREE.Vector3[]>([])

  // Discover lamp meshes + set their glow. Runs regardless of tier so the shade
  // glows even on low (where no real lights mount). Re-runs on model (re)load
  // (revision = modelsKey) and on config change.
  useEffect(() => {
    if (!active || !cfg.enabled) {
      setAnchors([])
      return
    }
    const found: THREE.Vector3[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.isLamp && obj.material) {
        applyEmissive(obj.material, cfg.color, cfg.emissiveIntensity)
        obj.updateWorldMatrix(true, false)
        const p = obj.getWorldPosition(new THREE.Vector3())
        // Dedupe multi-part fixtures (shade + bulb both named lamp)
        if (!found.some((q) => q.distanceTo(p) < 0.25)) found.push(p)
      }
    })
    setAnchors(found)
    invalidate()
    if (lampDebugRequested()) {
      // eslint-disable-next-line no-console
      console.info(
        `[lampdebug] found ${found.length} lamp(s):`,
        found.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`),
      )
    }
  }, [active, revision, scene, invalidate, cfg])

  const debug = lampDebugRequested() && cfg.enabled

  // Emissive-only tiers (low) / feature off: nothing to render but the effect
  // above has already set the glow.
  if (!cfg.enabled || !settings.lampLights) {
    return debug ? <LampDebug cfg={cfg} count={anchors.length} onChange={setOverride} /> : null
  }

  const shadowFar = cfg.distance > 0 ? cfg.distance : 25

  return (
    <>
      {anchors.slice(0, settings.lampMaxLights).map((p, i) => (
        <pointLight
          key={i}
          position={[p.x, p.y + cfg.offsetY, p.z]}
          color={cfg.color}
          intensity={cfg.intensity}
          distance={cfg.distance}
          decay={cfg.decay}
          castShadow={i < settings.lampShadowCasters}
          shadow-mapSize-width={cfg.shadowMapSize}
          shadow-mapSize-height={cfg.shadowMapSize}
          shadow-bias={cfg.bias}
          shadow-normalBias={cfg.normalBias}
          shadow-camera-far={shadowFar}
        />
      ))}
      {debug && <LampDebug cfg={cfg} count={anchors.length} onChange={setOverride} />}
    </>
  )
}

const D_INTENSITY = 2
const D_DISTANCE = 0.5

/**
 * Dev-only (?lampdebug=1) tuner. The console already lists the found lamp
 * positions (confirm your GLB names matched); here + / - scrub intensity and
 * [ / ] scrub range, printing a paste-ready stores.json block.
 */
function LampDebug({
  cfg,
  count,
  onChange,
}: {
  cfg: LampConfig
  count: number
  onChange: (next: LampConfig) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = { ...cfgRef.current }
      let handled = true
      switch (e.key) {
        case '+': case '=': c.intensity += D_INTENSITY; break
        case '-': case '_': c.intensity = Math.max(0, c.intensity - D_INTENSITY); break
        case ']': c.distance += D_DISTANCE; break
        case '[': c.distance = Math.max(0, c.distance - D_DISTANCE); break
        default: handled = false
      }
      if (!handled) return
      e.preventDefault()
      onChange(c)
      markStoreActivity()
      invalidate()
      // eslint-disable-next-line no-console
      console.info(`[lampdebug] ${count} lamp(s) · paste into stores.json →\n` + JSON.stringify({ lamps: c }, null, 2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [invalidate, onChange, count])

  return null
}
