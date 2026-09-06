import { MeshReflectorMaterial, useTexture } from '@react-three/drei'
import { useEffect } from 'react'
import * as THREE from 'three'

interface ReflectiveFloorProps {
  size?: number
  mixStrength?: number
  /** Maps to MeshReflectorMaterial mixBlur */
  blur?: number
  roughness?: number
  opacity?: number
  resolution?: number
  /** When false, renders a plain matte floor — skips the per-frame reflection render pass entirely */
  enabled?: boolean
  /** Opt-in shadow receiver (default off so /car + hero are unchanged; /store enables it for the window sun) */
  receiveShadow?: boolean
  /** Number of times texture repeats across floor (default: 30 for 60×60 floor with 2m tiles) */
  textureRepeat?: number
  /** Anisotropy level for texture sharpening (from quality settings, default: 16) */
  anisotropy?: number
}

// NOTE: prop defaults intentionally equal the values that used to be
// hardcoded in the JSX (roughness 1, mixBlur 0) so existing consumers
// (/store Scene, homepage hero, /car) render identically now that the
// props are actually honored.
export function HomeReflectiveFloor({
  size = 30,
  mixStrength = 0.85,
  blur = 0,
  roughness = 1,
  opacity = 1,
  resolution = 1024,
  enabled = true,
  receiveShadow = false,
  textureRepeat = 1,
  anisotropy = 16,
}: ReflectiveFloorProps) {
  // Load PBR textures only when reflections are enabled (High/Ultra quality tiers)
  // TODO: Normal and roughness maps are .exr format - convert to .png for compatibility
  const textures = useTexture(
  enabled
    ? {
        map: '/textures/Road015C_1K-JPG_Color.jpg',
      }
    : {}
)

  // Configure texture repeat and wrapping
  useEffect(() => {
    if (textures) {
      Object.values(textures).forEach((texture) => {
        if (texture) {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(textureRepeat, textureRepeat)
          texture.anisotropy = anisotropy
        }
      })
    }
  }, [textures, textureRepeat, anisotropy])
  return (
    <mesh
      name="reflective-floor"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -1, 0]}
      receiveShadow={receiveShadow}
    >
      <planeGeometry args={[size, size]} />
      {enabled ? (
        <MeshReflectorMaterial
          resolution={resolution}
          mixBlur={blur}
          mixStrength={mixStrength}
          mirror={0.1}
          depthScale={4}
          minDepthThreshold={0}
          maxDepthThreshold={.9}
          roughness={roughness}
          metalness={.7}
          color="#ffffff"
          opacity={1}
                    //@ts-expect-error rerere

          map={textures?.map}
          // normalMap={textures?.normalMap}
          // roughnessMap={textures?.roughnessMap}
        />
      ) : (
        // Same base look without the reflection FBO — used by low quality tier
        <meshStandardMaterial color="#3f3d39" metalness={0.6} roughness={1} />
      )}
    </mesh>
  )
}
