import { useTexture } from '@react-three/drei'
import { useEffect } from 'react'
import * as THREE from 'three'

interface TexturedFloorProps {
  size?: number
  textureRepeat?: number
  anisotropy?: number
}

export function TexturedFloor({
  size = 20,
  textureRepeat = 2,
  anisotropy = 0,
}: TexturedFloorProps) {
  // Load wood plank texture
  const texture = useTexture('/textures/floor/plank_flooring_04_diff_1k.jpg')

  // Configure texture repeat and wrapping
  useEffect(() => {
    if (texture) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(textureRepeat, textureRepeat)
      texture.anisotropy = anisotropy
    }
  }, [texture, textureRepeat, anisotropy])

  return (
    <mesh
      name="textured-floor"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -.9, 0]}
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        map={texture}
        roughness={1}
        metalness={0.6}
        color="#ffffff"
      />
    </mesh>
  )
}
