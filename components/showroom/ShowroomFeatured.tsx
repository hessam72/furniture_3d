'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type * as THREE from 'three'
import { usePresentation } from '@/stores/presentationStore'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { isARCapable, supportsBlobAR } from '@/lib/device-utils'
import { exportSignature, exportSinglePieceGLB } from '@/lib/three/exportConfigured'
import {
  defaultPaint,
  findCoverVariant,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'
import type { ShowroomConfig } from '@/lib/showroom/config'
import Reveal from './Reveal'
import { ArIcon, ArrowIcon, ChevronIcon, Icon, RotateIcon, SofaGhostIcon } from './icons'

const ShowroomStage = dynamic(() => import('./ShowroomStage'), {
  ssr: false,
  loading: () => null,
})

const ARProductViewer = dynamic(() => import('@/components/store/ARProductViewer'), { ssr: false })

/** The bare frame, shown by the "structure" toggle. Not a cover id, so it
 *  cannot collide with one. */
const FRAME = '__frame__'

/**
 * The showroom's own product spot: one piece, live, with its finishes on it.
 *
 * Three things the customer can do here that a photograph cannot answer —
 * turn it, re-cover it, and stand it in their own room — and each is the same
 * mechanism the product pages use rather than a second implementation:
 *
 *  - **Colour** writes the `cover` zone of the shared presentation store, so a
 *    finish picked here is the finish /product/[id] opens on.
 *  - **Layer** swaps which GLB the viewer mounts — a cover variant, or the
 *    frame. The frame is wood, so the palette swaps with it.
 *  - **AR** serialises what is on screen (`exportSinglePieceGLB`) and hands
 *    model-viewer the blob, exactly as the presentation page does; with no
 *    `ios-src` beside it, Quick Look builds the USDZ from that same file.
 */
export default function ShowroomFeatured({
  featured,
  presentation,
}: {
  featured: ShowroomConfig['featured']
  /** Null when the manifest has no entry for `presentationKey` — the section
   *  then keeps its copy and shows a still plate instead of a canvas. */
  presentation: ResolvedPresentation | null
}) {
  const config = presentation?.config ?? null
  const [layer, setLayer] = useState<string>(() => config?.layers.cover.default ?? FRAME)
  const [specsOpen, setSpecsOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const [arSupported, setArSupported] = useState(false)
  const [liveAR, setLiveAR] = useState(true)
  const [arOpen, setArOpen] = useState(false)
  const [arBusy, setArBusy] = useState(false)
  const [arUrl, setArUrl] = useState<string | null>(null)

  const setPaint = usePresentation((s) => s.setPaint)
  const initProduct = usePresentation((s) => s.initProduct)
  const activeColor = usePresentation((s) => s.paint.cover.color)

  /** The raw cached GLB behind the canvas, published by SimpleViewer. The AR
   *  export lives out here, outside the Canvas, and has no other way to it. */
  const source = useRef<THREE.Object3D | null>(null)
  const arCache = useRef<{ signature: string; url: string } | null>(null)

  const showingFrame = layer === FRAME
  const variant = useMemo(
    () => (config && !showingFrame ? findCoverVariant(config, layer) : null),
    [config, layer, showingFrame]
  )
  const modelPath = showingFrame ? config?.layers.frame.path : variant?.path

  /** Wood on the frame, upholstery on a cover — the viewer paints whatever it
   *  mounts as the `cover` zone, so the palette has to follow the layer. */
  const swatches: ZoneSwatch[] = useMemo(() => {
    if (!config) return []
    return (showingFrame ? config.palettes.wood : config.palettes.cover) ?? []
  }, [config, showingFrame])

  // Seed the shared store with the manifest's opening finish, once.
  useEffect(() => {
    if (!config || !presentation) return
    initProduct(presentation.key, defaultPaint(config), config.layers.cover.default, 1)
  }, [config, presentation, initProduct])

  // Follow the layer with its palette's first swatch, so the frame never opens
  // wearing the upholstery colour.
  useEffect(() => {
    const first = swatches[0]
    if (!first) return
    setPaint({ color: first.hex, roughness: first.roughness ?? 0.6 }, 'cover')
  }, [swatches, setPaint])

  useEffect(() => {
    setArSupported(isARCapable())
    supportsBlobAR().then(setLiveAR)
  }, [])

  useEffect(
    () => () => {
      if (arCache.current) URL.revokeObjectURL(arCache.current.url)
      arCache.current = null
    },
    []
  )

  const probe = useAssetProbe(useMemo(() => (modelPath ? [modelPath] : []), [modelPath]))
  const canRender = !!config && !!modelPath && probe.state === 'ready' && !failed

  const handleError = useCallback(() => setFailed(true), [])
  const handleReady = useCallback(() => setReady(true), [])

  const openAR = useCallback(async () => {
    if (!source.current || !liveAR) {
      setArOpen(true)
      return
    }

    const { paint } = usePresentation.getState()
    const signature = exportSignature(paint, layer)
    if (arCache.current?.signature === signature) {
      setArUrl(arCache.current.url)
      setArOpen(true)
      return
    }

    setArBusy(true)
    try {
      const blob = await exportSinglePieceGLB(source.current, paint, variant)
      const url = URL.createObjectURL(blob)
      if (arCache.current) URL.revokeObjectURL(arCache.current.url)
      arCache.current = { signature, url }
      setArUrl(url)
      setArOpen(true)
    } catch (error) {
      console.error('[showroom] AR export failed', error)
    } finally {
      setArBusy(false)
    }
  }, [layer, liveAR, variant])

  const productName = presentation?.product.name ?? featured.title

  return (
    <section className="sr-section sr-featured" id="featured">
      <div className="sr-shell">
        <div className="sr-featured-top">
          <Reveal className="sr-counter">
            {featured.index && (
              <p style={{ margin: 0 }}>
                <b>{featured.index}</b>
                {featured.total && <span> / {featured.total}</span>}
              </p>
            )}
            {featured.eyebrow && <p>{featured.eyebrow}</p>}
          </Reveal>

          {featured.chips && featured.chips.length > 0 && (
            <Reveal className="sr-chips" delay={80}>
              {featured.chips.map((chip) => (
                <span className="sr-chip" key={chip.label}>
                  <Icon name={chip.icon} size={15} />
                  {chip.label}
                </span>
              ))}
            </Reveal>
          )}
        </div>

        <div className="sr-featured-grid">
          <Reveal className="sr-featured-copy">
            {featured.category && <p className="sr-section-eyebrow">{featured.category}</p>}
            <h2 className="sr-h2">{featured.title}</h2>
            {featured.description && <p className="sr-featured-desc">{featured.description}</p>}

            {swatches.length > 0 && (
              <div className="sr-option-row">
                <span className="sr-option-label">{featured.colorLabel ?? 'رنگ'}</span>
                <div className="sr-swatches">
                  {swatches.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      className="sr-swatch"
                      style={{ background: swatch.hex }}
                      aria-label={swatch.name}
                      aria-pressed={activeColor.toLowerCase() === swatch.hex.toLowerCase()}
                      onClick={() =>
                        setPaint({ color: swatch.hex, roughness: swatch.roughness ?? 0.6 }, 'cover')
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {config && (
              <div className="sr-option-row">
                <span className="sr-option-label">{featured.coverLabel ?? 'رویه'}</span>
                <div className="sr-seg">
                  {config.layers.cover.variants.map((cover) => (
                    <button
                      key={cover.id}
                      type="button"
                      aria-pressed={layer === cover.id}
                      onClick={() => setLayer(cover.id)}
                    >
                      {cover.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={showingFrame}
                    onClick={() => setLayer(FRAME)}
                  >
                    {featured.frameLabel ?? config.layers.frame.label}
                  </button>
                </div>
              </div>
            )}

            <div className="sr-featured-actions">
              {featured.cta && (
                <Link className="sr-btn sr-btn-solid" href={featured.cta.href}>
                  {featured.cta.label}
                  <ArrowIcon className="sr-arrow" size={17} />
                </Link>
              )}
              {arSupported && canRender && (
                <button type="button" className="sr-btn sr-btn-outline" onClick={openAR} disabled={arBusy}>
                  <ArIcon size={18} />
                  {arBusy ? 'در حال آماده‌سازی…' : featured.arLabel ?? 'نمایش در خانه (AR)'}
                </button>
              )}
            </div>

            {featured.specs && featured.specs.length > 0 && (
              <div className="sr-specs">
                <button
                  type="button"
                  className="sr-specs-toggle"
                  aria-expanded={specsOpen}
                  aria-controls="sr-specs-body"
                  onClick={() => setSpecsOpen((open) => !open)}
                >
                  {featured.specsLabel ?? 'مشخصات کوتاه'}
                  <ChevronIcon size={17} />
                </button>
                <div className="sr-specs-body" id="sr-specs-body" data-open={specsOpen}>
                  <dl>
                    {featured.specs.map((spec) => (
                      <div key={spec.label}>
                        <dt>{spec.label}</dt>
                        <dd>{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </Reveal>

          <Reveal className="sr-stage-col" delay={120}>
            <div className="sr-stage">
              {canRender && config && modelPath && (
                <ShowroomStage
                  config={config}
                  modelPath={modelPath}
                  sourceRef={source}
                  onReady={handleReady}
                  onError={handleError}
                />
              )}
              {!ready && (
                <div className="sr-viewer-fallback">
                  <SofaGhostIcon size={64} />
                  {probe.state === 'missing' || failed ? (
                    <span>مدل سه‌بعدی این محصول در دسترس نیست.</span>
                  ) : (
                    <span>در حال بارگذاری مدل سه‌بعدی…</span>
                  )}
                </div>
              )}
              <div className="sr-podium" />
            </div>

            {featured.rotateHint && (
              <div className="sr-rotate-hint">
                <b className="sr-latin">{featured.rotateHint.value}</b>
                <RotateIcon size={18} />
                <span>{featured.rotateHint.label}</span>
              </div>
            )}
          </Reveal>
        </div>
      </div>

      {arOpen && (
        <div className="sr-ar-host">
          <ARProductViewer
            glbPath={arUrl ?? presentation?.product.glbPath ?? ''}
            usdzPath={arUrl ? undefined : presentation?.product.usdzPath}
            productName={productName}
            arScale="fixed"
            onClose={() => setArOpen(false)}
          />
        </div>
      )}
    </section>
  )
}
