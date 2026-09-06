'use client'

import { memo, type ReactElement } from 'react'
import { EffectComposer, Bloom, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import { useState } from 'react'
import { useQuality } from '@/contexts/QualityContext'
import { TOUCH_QUERY, type PresentationConfig } from '@/lib/product/presentation'

/**
 * A lighter composer than the showroom's, tuned for fabric rather than paint.
 *
 * AO follows `settings.enableN8AO` and nothing else. It used to be promoted on
 * `high` too, over the top of a tier config that sets the flag `false` there —
 * so `high` was the one tier running an effect its own preset had switched off,
 * and the halo N8AO bleeds off a large silhouette read as a soft shadow hanging
 * in the air behind the piece.
 *
 * The promotion had a reason, and it has expired: it was justified by there
 * being "no shadow or reflection passes competing for budget", with AO standing
 * in for the contact shadow the page dropped. This page now has both. The sun
 * casts a real contact shadow under the piece and the floor reflects it, which
 * is what grounds it — better than AO ever did, and without the halo.
 *
 * `quality.ao` in the manifest forces it either way for a product that wants
 * the occlusion back.
 *
 * Anti-aliasing is one method, never two, and never MSAA on touch hardware.
 * The composer's input buffer is RGBA16F, so `multisampling: 4` costs 32 bytes
 * a pixel — over 100MB for that one target at the `high` tier's DPR on a phone
 * or tablet, before the resolve target, SMAA's two full-res targets and the
 * bloom mip chain. That is what was killing the page. SMAA was also being
 * pushed unconditionally *alongside* MSAA, so every MSAA tier paid twice for
 * one result.
 *
 * So a touch device gets SMAA only, whatever `quality.mobile` pins. Unlike DPR
 * or anisotropy this is not a knob the manifest gets to spend: it decides how
 * sharp the piece looks, not whether the tab survives being opened.
 */
function PresentationPostProcessingImpl({ config }: { config: PresentationConfig }) {
  const { settings } = useQuality()
  // Read once, synchronously. This component only ever mounts inside a Canvas
  // that is `dynamic(..., { ssr: false })`, so there is no server HTML to
  // disagree with — and it must be right on the *first* render: a composer that
  // starts multisampled has already made the allocation by the time an effect
  // could correct it.
  const [touch] = useState(() => window.matchMedia(TOUCH_QUERY).matches)
  const effects: ReactElement[] = []

  const multisampling = touch ? 0 : settings.multisampling
  // Silhouette quality is the whole point of this page, so every tier keeps AA —
  // SMAA carries it wherever MSAA is not.
  const smaa = multisampling === 0

  if (config.quality?.ao ?? settings.enableN8AO) {
    effects.push(
      <N8AO
        key="n8ao"
        halfRes
        aoRadius={0.35}
        intensity={2}
        distanceFalloff={1.0}
        quality={settings.n8aoQuality}
        color="black"
      />
    )
  }

  // Lower than the car scene's 0.15 — upholstery must not glow.
  effects.push(
    <Bloom
      key="bloom"
      intensity={0.1}
      luminanceThreshold={0.92}
      luminanceSmoothing={0.2}
      mipmapBlur
      radius={0.3}
    />
  )

  if (smaa) effects.push(<SMAA key="smaa" />)

  // Lighter than the showroom's 0.62 — the booth already frames the shot.
  effects.push(<Vignette key="vignette" offset={0.35} darkness={0.5} />)

  return <EffectComposer multisampling={multisampling}>{effects}</EffectComposer>
}

/**
 * Memoised for a second reason on top of the one in PresentationScene: a
 * re-render of this component re-enters EffectComposer, and that is the call
 * that threw `Cannot read properties of null (reading 'alpha')` out of React
 * and took the whole page down when the context had been lost. Fewer entries,
 * fewer chances.
 */
export const PresentationPostProcessing = memo(PresentationPostProcessingImpl)
