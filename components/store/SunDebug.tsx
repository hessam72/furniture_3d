'use client'
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { useHelper } from '@react-three/drei'
import * as THREE from 'three'
import type { SunConfig } from './hooks/useStoreConfig'
import { markStoreActivity } from './activityGovernor'

const MOVE = 0.5
const INTENSITY = 2
const BOUND = 1

function clone(c: SunConfig): SunConfig {
  return {
    ...c,
    position: [...c.position],
    target: [...c.target],
    soft: { ...c.soft },
    shadow: { ...c.shadow },
  }
}

/** Symmetric grow/shrink of the ortho shadow box (keeps it centred) */
function resizeBox(s: SunConfig['shadow'], d: number): SunConfig['shadow'] {
  return {
    ...s,
    left: s.left - d,
    right: s.right + d,
    top: s.top + d,
    bottom: s.bottom - d,
  }
}

type Props = {
  lightRef: RefObject<THREE.DirectionalLight | null>
  camRef: RefObject<THREE.OrthographicCamera | null>
  cfg: SunConfig
  onChange: (next: SunConfig) => void
}

/**
 * Dev-only (?sundebug=1) sun-alignment overlay. Draws the shadow-camera
 * frustum (verify it encloses the whole room) and lets arrow keys nudge the
 * sun/target, printing a paste-ready stores.json block on each change.
 *
 *   Arrows        move sun on X/Z        Shift+Arrows  move target on X/Z
 *   PageUp/Down   move sun on Y          + / -         intensity
 *   [ / ]         shrink / grow box
 */
export function SunDebug({ lightRef, camRef, cfg, onChange }: Props) {
  const invalidate = useThree((s) => s.invalidate)

  // drei's useHelper types the ref as non-null; ours are populated by commit time
  useHelper(camRef as MutableRefObject<THREE.OrthographicCamera>, THREE.CameraHelper)
  useHelper(lightRef as MutableRefObject<THREE.DirectionalLight>, THREE.DirectionalLightHelper, 2, '#ffaa00')

  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = clone(cfgRef.current)
      const axis = e.shiftKey ? c.target : c.position
      let handled = true
      switch (e.key) {
        case 'ArrowLeft': axis[0] -= MOVE; break
        case 'ArrowRight': axis[0] += MOVE; break
        case 'ArrowUp': axis[2] -= MOVE; break
        case 'ArrowDown': axis[2] += MOVE; break
        case 'PageUp': c.position[1] += MOVE; break
        case 'PageDown': c.position[1] -= MOVE; break
        case '+': case '=': c.intensity += INTENSITY; break
        case '-': case '_': c.intensity = Math.max(0, c.intensity - INTENSITY); break
        case ']': c.shadow = resizeBox(c.shadow, BOUND); break
        case '[': c.shadow = resizeBox(c.shadow, -BOUND); break
        default: handled = false
      }
      if (!handled) return
      e.preventDefault()
      onChange(c)
      markStoreActivity()
      invalidate()
      // eslint-disable-next-line no-console
      console.info('[sundebug] paste into stores.json →\n' + JSON.stringify({ sun: c }, null, 2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [invalidate, onChange])

  return null
}
