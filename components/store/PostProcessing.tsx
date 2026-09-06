import { type ReactElement, Suspense, lazy } from 'react'
import { EffectComposer, Bloom, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import { useQuality } from '@/contexts/QualityContext'

// realism-effects is only needed for the ultra-tier opt-in SSGI mode — it
// lives in its own chunk and downloads on first toggle. The standard stack
// keeps rendering as the Suspense fallback while the chunk streams in.
const SSGIComposer = lazy(() => import('./SSGIComposer'))

export function PostProcessing() {
  const { settings, ssgiEnabled } = useQuality()
  const ssgiActive = settings.experimentalSSGI && ssgiEnabled
  if (ssgiActive) {
    return (
      <Suspense fallback={<StandardComposer />}>
        <SSGIComposer />
      </Suspense>
    )
  }
  return <StandardComposer />
}

function StandardComposer() {
  const { settings } = useQuality()

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
  if (settings.enableSMAA) {
    effects.push(<SMAA key="smaa" />)
  }

  // Vignette - VERY LIGHT: simple screen overlay
  effects.push(<Vignette key="vignette" eskil={false} offset={0.32} darkness={0.62} />)

  return <EffectComposer multisampling={settings.multisampling}>{effects}</EffectComposer>
}
