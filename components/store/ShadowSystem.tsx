'use client'
import { SoftShadows } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

export function ShadowSystem({
  size = 20,
  samples = 17,
  focus = 0,
}: {
  size?: number
  samples?: number
  focus?: number
}) {
  const { scene, gl, invalidate } = useThree()

  // drei SoftShadows swaps the global shadow shader chunk + recompiles on
  // mount / param change, but skips array materials and never repaints. Cover
  // both gaps: force array-material recompile, then invalidate so the newly
  // compiled state actually draws under frameloop='demand'.
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        obj.material.needsUpdate = true
      }
    })
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [size, samples, focus, scene, gl, invalidate])

  return (
    <SoftShadows
      size={size}
      samples={samples}
      focus={focus}
    />
  )
}
