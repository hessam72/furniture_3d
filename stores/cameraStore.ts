import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import * as THREE from 'three'

export type PresetName = 'home' | 'front' | 'rear' | 'sideLeft' | 'sideRight' | 'top' | 'detail' | 'interior' | 'home_initial' | 'home_front_wheel' | 'home_spoiler' | 'home_finale'

export interface CameraPreset {
  position: [number, number, number]
  target: [number, number, number]
  name: string
  label: string
}

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768

const MOBILE_DISTANCE_MULTIPLIER = 1.6

const scaleCameraPosition = (pos: [number, number, number]): [number, number, number] => {
  if (!isMobile()) return pos
  return [
    pos[0] * MOBILE_DISTANCE_MULTIPLIER,
    pos[1] * MOBILE_DISTANCE_MULTIPLIER,
    pos[2] * MOBILE_DISTANCE_MULTIPLIER
  ]
}

export const CAMERA_PRESETS: Record<PresetName, CameraPreset> = {
  home: {
    position: [5, 2, 5],
    target: [0, 0.5, 0],
    name: 'home',
    label: 'Home'
  },
  front: {
    position: [0, 1.2, 5],
    target: [0, 0.5, 0],
    name: 'front',
    label: 'Front View'
  },
  rear: {
    position: [0, 1.2, -5],
    target: [0, 0.5, 0],
    name: 'rear',
    label: 'Rear View'
  },
  sideLeft: {
    position: [-5, 1.2, 0],
    target: [0, 0.5, 0],
    name: 'sideLeft',
    label: 'Left Side'
  },
  sideRight: {
    position: [5, 1.2, 0],
    target: [0, 0.5, 0],
    name: 'sideRight',
    label: 'Right Side'
  },
  top: {
    position: [0, 6, 0],
    target: [0, 0, 0],
    name: 'top',
    label: 'Top View'
  },
  detail: {
    position: [2, 1, 3],
    target: [0, 0.5, 0],
    name: 'detail',
    label: 'Detail View'
  },
  interior: {
    position: [0, 1, 0.5],
    target: [0, 1, 2],
    name: 'interior',
    label: 'Interior View'
  },
  home_initial: {
    position: [5, 2, 5],
    target: [0, 0.5, 0],
    name: 'home_initial',
    label: 'Full Car'
  },
  home_front_wheel: {
    position: [2.5, 0.8, 2.5],
    target: [1.3, 0.4, 0.2],
    name: 'home_front_wheel',
    label: 'Front Wheel Detail'
  },
  home_spoiler: {
    position: [-2, 1.8, -3.5],
    target: [0, 1.3, -2],
    name: 'home_spoiler',
    label: 'Spoiler Detail'
  },
  home_finale: {
    position: [6, 3, 6],
    target: [0, 0.5, 0],
    name: 'home_finale',
    label: 'Final View'
  }
}

interface CameraState {
  activePreset: PresetName | null
  autoRotate: boolean
  autoRotateSpeed: number
  targetPosition: THREE.Vector3 | null
  targetLookAt: THREE.Vector3 | null

  // Actions
  setPreset: (preset: PresetName) => void
  setAutoRotate: (enabled: boolean) => void
  setAutoRotateSpeed: (speed: number) => void
  clearTransition: () => void
}

export const useCameraStore = create<CameraState>()(
  devtools(
    (set) => ({
      activePreset: null,
      autoRotate: false,
      autoRotateSpeed: 2.0,
      targetPosition: null,
      targetLookAt: null,

      setPreset: (preset: PresetName) => {
        const config = CAMERA_PRESETS[preset]
        const scaledPosition = scaleCameraPosition(config.position)
        set({
          activePreset: preset,
          targetPosition: new THREE.Vector3(...scaledPosition),
          targetLookAt: new THREE.Vector3(...config.target)
        })
      },

      setAutoRotate: (enabled: boolean) => {
        set({ autoRotate: enabled })
      },

      setAutoRotateSpeed: (speed: number) => {
        set({ autoRotateSpeed: speed })
      },

      clearTransition: () => {
        set({
          targetPosition: null,
          targetLookAt: null
        })
      }
    }),
    { name: 'CameraStore' }
  )
)
