'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * A vertical gradient + vignette sweep, filling the viewport regardless of
 * camera orientation — a cyclorama behind the piece instead of a flat void.
 *
 * A fullscreen triangle rather than a plane in world space: the vertex shader
 * writes clip-space position directly, ignoring the mesh's own transform and
 * the camera's view/projection, so the sweep covers exactly the viewport at
 * every orbit angle for the cost of one triangle and no render target —
 * `depthTest`/`depthWrite` are both off and `renderOrder` is -1, so it paints
 * once, first, behind everything real. The same role `scene.background`
 * plays today; that stays mounted underneath as the raw clear colour (and
 * the one thing this shader falls back to when unauthored), so a shader that
 * somehow failed to compile would still leave the page on a flat ground
 * rather than black.
 */
export interface BackdropSpec {
  top: string
  bottom: string
  /** 0 disables. Darkens the corners toward `bottom`. */
  vignette: number
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uVignette;
  void main() {
    vec3 color = mix(uBottom, uTop, vUv.y);
    if (uVignette > 0.0) {
      float d = distance(vUv, vec2(0.5));
      color = mix(color, uBottom, smoothstep(0.3, 0.9, d) * uVignette);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`

// The standard fullscreen-triangle trick: one triangle reaching past every
// edge of clip space covers it completely, cheaper than a quad's two
// triangles and with no seam down the diagonal. UVs follow the same
// over-reach so vUv is exactly [0,1] at the screen edges.
const POSITIONS = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0])
const UVS = new Float32Array([0, 0, 2, 0, 0, 2])

export default function ViewerBackdrop({ top, bottom, vignette }: BackdropSpec) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(POSITIONS, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(UVS, 2))
    return geo
  }, [])

  // Built once; a colour or vignette change (a manifest edit, not something
  // that happens at runtime) mutates the same uniforms rather than rebuilding
  // the material, so no render ever recompiles this shader.
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(top) },
      uBottom: { value: new THREE.Color(bottom) },
      uVignette: { value: vignette },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  uniforms.uTop.value.set(top)
  uniforms.uBottom.value.set(bottom)
  uniforms.uVignette.value = vignette

  return (
    // Local space is meaningless here — the vertex shader ignores it — so
    // frustum culling, which tests local bounds against the camera, has to
    // be turned off or three culls a mesh it thinks sits at the origin.
    <mesh geometry={geometry} renderOrder={-1} frustumCulled={false}>
      <shaderMaterial
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        // Raw output, not scene lighting — matches scene.background, which
        // three never runs through tone mapping either.
        toneMapped={false}
      />
    </mesh>
  )
}
