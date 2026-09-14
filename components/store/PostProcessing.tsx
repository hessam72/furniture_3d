import { type ReactElement } from 'react'
import { EffectComposer, Bloom, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import { useQuality } from '@/contexts/QualityContext'

/**
 * The opt-in SSGI/TRAA composer is gone, and with it `realism-effects`.
 *
 * It was gated on `settings.experimentalSSGI`, which is `false` on all four
 * presets — including `ultra` — so the branch was unreachable at runtime and
 * had been for as long as the current preset table has existed. It was also the
 * only thing holding three at 0.170: realism-effects needs
 * `WebGLMultipleRenderTargets`, removed in r172, and r172 is where the Safari
 * WebGL2 context-retention work landed. Dead code with a real cost.
 */
export function PostProcessing() {
  return <StandardComposer />
}

function StandardComposer() {
  const { settings, device } = useQuality()

  /**
   * No MSAA on touch hardware, whatever the tier says.
   *
   * The composer's input buffer is HalfFloat — 8 bytes a pixel — and
   * `multisampling: 4` makes it 32, before the resolve target, SMAA's two
   * full-res targets and the bloom mip chain. /product worked this out and
   * fixed it (@see PresentationPostProcessing); /store kept passing the tier's
   * number straight through, so a phone on `medium` was still paying for 4x.
   *
   * SMAA then has to cover for it: with MSAA off, `enableSMAA` alone would
   * leave `medium` with no edge AA at all, so it follows the MSAA decision
   * rather than the tier.
   */
  const multisampling = device === 'desktop' ? settings.multisampling : 0
  const smaa = multisampling === 0 || settings.enableSMAA

  // EffectComposer types require ReactElement children (no false), so the
  // effect stack is assembled as an array
  const effects: ReactElement[] = []

  // N8AO - screen-space AO, quality follows tier. halfRes computes AO at
  // half resolution with depth-aware upsampling: ~3x cheaper, visually
  // near-identical on a car scene.
  if (settings.enableN8AO) {
    effects.push(
      <N8AO
        key="n8ao"
        halfRes
        aoRadius={0.5}
        intensity={3}
        distanceFalloff={1.0}
        quality={settings.n8aoQuality}
        color="black"
      />
    )
  }

  // Bloom - high threshold so only true highlights glow; paint stays crisp
  effects.push(
    <Bloom
      key="bloom"
      intensity={0.15}
      luminanceThreshold={0.9}
      luminanceSmoothing={0.2}
      mipmapBlur
      radius={0.3}
    />
  )

  // SMAA - cheap edge AA; the composer bypasses canvas MSAA so this matters
  if (smaa) {
    effects.push(<SMAA key="smaa" />)
  }

  // Vignette - VERY LIGHT: simple screen overlay
  effects.push(<Vignette key="vignette" eskil={false} offset={0.32} darkness={0.62} />)

  return <EffectComposer multisampling={multisampling}>{effects}</EffectComposer>
}
