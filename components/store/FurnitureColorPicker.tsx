'use client'

import { useState } from 'react'
import { Billboard } from '@react-three/drei'
import { useFurnitureConfig } from '@/stores/furnitureConfigStore'
import type { FurnitureColor } from '@/stores/furnitureConfigStore'
import * as THREE from 'three'

interface FurnitureColorPickerProps {
  position: [number, number, number]
  colors: FurnitureColor[]
  currentColor: string
  originalColor?: string
}

export function FurnitureColorPicker({
  position,
  colors,
  currentColor,
  originalColor,
}: FurnitureColorPickerProps) {
  const { setColor } = useFurnitureConfig()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const handleColorClick = (colorHex: string) => {
    setColor(colorHex)
  }

  const allColors: FurnitureColor[] = originalColor
    ? [{ name: 'Original', hex: originalColor }, ...colors]
    : colors

  return (
    <Billboard position={position} follow={true} lockX={false} lockY={false} lockZ={false}>
      <group position={[0, 0, 0]}>
        {allColors.map((color, index) => {
          const isActive = color.hex === currentColor
          const isHovered = hoveredIndex === index
          const scale = isActive ? 0.35 : isHovered ? 0.3 : 0.25
          const x = index * 0.7 - ((allColors.length - 1) * 0.7) / 2

          return (
            <mesh
              key={color.hex}
              position={[x, 0, 0]}
              scale={[scale, scale, scale]}
              onClick={() => handleColorClick(color.hex)}
              onPointerOver={() => setHoveredIndex(index)}
              onPointerOut={() => setHoveredIndex(null)}
              castShadow={false}
              receiveShadow={false}
            >
              <sphereGeometry args={[0.5, 32, 32]} />
              <meshStandardMaterial
                color={color.hex}
                metalness={0.25}
                roughness={0.35}
                emissive={isActive ? color.hex : '#000000'}
                emissiveIntensity={isActive ? 0.2 : 0}
              />
              {isActive && (
                <lineSegments>
                  <edgesGeometry attach="geometry" args={[new THREE.SphereGeometry(0.55, 16, 16)]} />
                  <lineBasicMaterial attach="material" color="#ffffff" transparent opacity={0.65} />
                </lineSegments>
              )}
            </mesh>
          )
        })}
      </group>
    </Billboard>
  )
}
