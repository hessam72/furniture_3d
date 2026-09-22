'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useQuality } from '@/contexts/QualityContext'
import { LAMP_BUDGET } from '@/lib/config/deviceTier'
import type { LampConfig, StoreConfig } from './hooks/useStoreConfig'
import { markStoreActivity } from './activityGovernor'
import { requestShadowUpdate } from './staticShadows'

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
 * point lights are gated by settings.lampLights and capped by lampMaxLights
 * and the device's LAMP_BUDGET; casters use a native cube-PCF shadow (drei's
 * PCSS only patches directional/spot getShadow — point lights are unaffected).
 *
 * The lights are **slots**, not lamps. It used to light the first N lamps in
 * scene-traversal order — wherever those happened to be — and pay for every
 * one of them in every lit fragment. Now a fixed number of lights follows the
 * lamps nearest the camera: a lamp's pool is short-range (`distance`), so the
 * nearest few are the ones whose light is on screen, and every other lamp
 * keeps its emissive glow. The count never changes while walking, so no
 * material ever recompiles; a slot that changes lamp fades out, moves and
 * fades back in. With no more lamps than slots this is exactly the old scene.
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
  const { settings, device } = useQuality()

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

  return (
    <>
      <LampSlots anchors={anchors} cfg={cfg} budget={LAMP_BUDGET[device]} />
      {debug && <LampDebug cfg={cfg} count={anchors.length} onChange={setOverride} />}
    </>
  )
}

/** Seconds a slot takes to fade out (or in) when it changes lamp */
const SLOT_FADE = 0.3
/** How often slots are re-assigned, seconds */
const ASSIGN_INTERVAL = 0.25
/** A lamp must be this much nearer (world units) than a slot's current lamp to take it */
const ASSIGN_HYSTERESIS = 1

interface Slot {
  /** Lamp index this slot is lighting, -1 when unassigned */
  lamp: number
  /** Lamp waiting for this slot once it has faded out */
  next: number
  /** 0..1 intensity factor */
  level: number
}

const _cam = new THREE.Vector3()

function LampSlots({
  anchors,
  cfg,
  budget,
}: {
  anchors: THREE.Vector3[]
  cfg: LampConfig
  budget: { lights: number; casters: number }
}) {
  const { settings } = useQuality()
  const camera = useThree((s) => s.camera)
  const count = Math.min(settings.lampMaxLights, budget.lights, anchors.length)
  const casters = Math.min(settings.lampShadowCasters, budget.casters, count)

  const lightRefs = useRef<(THREE.PointLight | null)[]>([])
  const slots = useRef<Slot[]>([])
  const sinceAssign = useRef(0)

  const place = (i: number, lamp: number) => {
    const light = lightRefs.current[i]
    const p = anchors[lamp]
    if (!light || !p) return
    light.position.set(p.x, p.y + cfg.offsetY, p.z)
    // A frozen cube map drawn from where the lamp used to be is wrong now
    if (i < casters) requestShadowUpdate()
  }

  // (Re)seed on a new lamp set or slot count: nearest lamps, fully lit, no
  // fade — this runs at load, behind the loading screen.
  useEffect(() => {
    camera.getWorldPosition(_cam)
    const nearest = anchors
      .map((p, lamp) => ({ lamp, d: p.distanceToSquared(_cam) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
    slots.current = nearest.map(({ lamp }) => ({ lamp, next: -1, level: 1 }))
    slots.current.forEach((slot, i) => place(i, slot.lamp))
    sinceAssign.current = 0
    requestShadowUpdate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchors, count, casters, camera, cfg.offsetY])

  useFrame((_, delta) => {
    const list = slots.current
    if (list.length === 0) return

    sinceAssign.current += delta
    if (sinceAssign.current >= ASSIGN_INTERVAL && list.length < anchors.length) {
      sinceAssign.current = 0
      camera.getWorldPosition(_cam)
      const taken = new Set(list.map((s) => (s.next >= 0 ? s.next : s.lamp)))
      const ranked = anchors
        .map((p, lamp) => ({ lamp, d: p.distanceTo(_cam) }))
        .sort((a, b) => a.d - b.d)
      for (let r = 0; r < list.length; r++) {
        const cand = ranked[r]
        if (taken.has(cand.lamp)) continue
        // Give it the settled slot whose lamp is farthest away, if it is
        // clearly nearer than that one
        let worst = -1
        let worstD = -Infinity
        list.forEach((slot, i) => {
          if (slot.next >= 0) return
          const d = anchors[slot.lamp].distanceTo(_cam)
          if (d > worstD) {
            worstD = d
            worst = i
          }
        })
        if (worst < 0 || cand.d + ASSIGN_HYSTERESIS >= worstD) break
        list[worst].next = cand.lamp
        taken.add(cand.lamp)
      }
    }

    let fading = false
    const step = delta / SLOT_FADE
    list.forEach((slot, i) => {
      const target = slot.next >= 0 ? 0 : 1
      if (slot.level !== target) {
        slot.level = target === 0 ? Math.max(0, slot.level - step) : Math.min(1, slot.level + step)
        fading = true
      }
      if (slot.next >= 0 && slot.level === 0) {
        slot.lamp = slot.next
        slot.next = -1
        place(i, slot.lamp)
      }
      const light = lightRefs.current[i]
      if (light) light.intensity = cfg.intensity * slot.level
    })
    // Keep the demand loop drawing until every fade has landed
    if (fading) markStoreActivity()
  })

  const shadowFar = cfg.distance > 0 ? cfg.distance : 25

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lightRefs.current[i] = l
          }}
          color={cfg.color}
          intensity={cfg.intensity}
          distance={cfg.distance}
          decay={cfg.decay}
          castShadow={i < casters}
          shadow-mapSize-width={cfg.shadowMapSize}
          shadow-mapSize-height={cfg.shadowMapSize}
          shadow-bias={cfg.bias}
          shadow-normalBias={cfg.normalBias}
          shadow-camera-far={shadowFar}
        />
      ))}
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
