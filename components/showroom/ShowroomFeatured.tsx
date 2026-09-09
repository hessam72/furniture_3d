'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type * as THREE from 'three'
import { usePresentation } from '@/stores/presentationStore'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { isARCapable } from '@/lib/device-utils'
import {
  arModelPath,
  defaultPaint,
  findCoverVariant,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'
import type { ShowroomConfig } from '@/lib/showroom/config'
import { RendererStatsOverlay } from '@/components/three/RendererStatsOverlay'
import { useContextRecovery } from '@/hooks/useContextRecovery'
import { useGltfCacheEviction } from '@/hooks/useGltfCacheEviction'
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
 *  - **AR** hands model-viewer the selected cover's own GLB — the same static
 *    file the canvas is drawing — so the overlay opens with nothing to build.
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
  /** A lost context reuses the section's existing fallback plate; it only ever
   *  lacked a signal. @see useContextRecovery */
  const recovery = useContextRecovery({ surface: 'viewer' })

  const [arSupported, setArSupported] = useState(false)
  const [arOpen, setArOpen] = useState(false)

  const setPaint = usePresentation((s) => s.setPaint)
  const initProduct = usePresentation((s) => s.initProduct)
  const activeColor = usePresentation((s) => s.paint.cover.color)

  /** The raw cached GLB behind the canvas, published by SimpleViewer. */
  const source = useRef<THREE.Object3D | null>(null)

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

  useEffect(() => setArSupported(isARCapable()), [])

  // The overlay is fixed and full-screen; the page behind it must not scroll
  // under the customer's drag while they are placing the piece.
  useEffect(() => {
    if (!arOpen) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [arOpen])

  const probe = useAssetProbe(useMemo(() => (modelPath ? [modelPath] : []), [modelPath]))

  // Every cover the visitor toggled through, not just the one on screen. This
  // section re-probes and re-parses per toggle and never released any of them.
  useGltfCacheEviction(modelPath ? [modelPath] : [])
  const canRender = !!config && !!modelPath && probe.state === 'ready' && !failed && !recovery.lost

  const handleError = useCallback(() => setFailed(true), [])
  const handleReady = useCallback(() => setReady(true), [])

  /**
   * The file AR shows: the selected cover's own GLB, served as-is.
   *
   * The section used to serialise the live scene to a GLB on tap, colours baked
   * in. That is what crashed real devices: the scene walked and cloned, the
   * result held as an ArrayBuffer *and* a Blob, all while model-viewer starts a
   * second WebGL context. A static URL is instant and works on every AR path —
   * Scene Viewer refuses blob URLs outright — so the button opens straight into
   * the overlay with nothing to prepare. On the structure toggle it is still
   * the upholstered piece: nobody places a bare frame in their living room.
   */
  const arPath = useMemo(() => {
    if (!config) return presentation?.product.glbPath ?? null
    return arModelPath(config, showingFrame ? config.layers.cover.default : layer)
      ?? presentation?.product.glbPath
      ?? null
  }, [config, layer, showingFrame, presentation?.product.glbPath])

  const openAR = useCallback(() => {
    if (arPath) setArOpen(true)
  }, [arPath])

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
          <Reveal className="sr-featured-head">
            {featured.category && <p className="sr-section-eyebrow">{featured.category}</p>}
            <h2 className="sr-h2">{featured.title}</h2>
            {featured.description && <p className="sr-featured-desc">{featured.description}</p>}
          </Reveal>

          {/* Everything that changes the piece. Its own block, because on a
              phone it belongs under the piece it changes — the name and the
              description stay above it. */}
          <Reveal className="sr-featured-controls" delay={60}>
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
              {arPath && (
                <button type="button" className="sr-btn sr-btn-outline" onClick={openAR}>
                  <ArIcon size={18} />
                  {arSupported
                    ? featured.arLabel ?? 'نمایش در خانه (AR)'
                    : featured.arPreviewLabel ?? 'پیش‌نمایش سه‌بعدی'}
                </button>
              )}
            </div>

            {!arSupported && (
              <p className="sr-ar-note">
                برای قرار دادن مبل در فضای واقعی، این صفحه را روی گوشی یا تبلت باز کنید.
              </p>
            )}

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
            {/* Lenis listens for the wheel on the window, so without this it
                scrolls the page at the same time OrbitControls dollies the
                piece. `-wheel` only: touch is left to the browser, which the
                viewer's `touch-action: pan-y` already shares correctly. */}
            <div className="sr-stage" data-lenis-prevent-wheel>
              {/* `!arOpen`: the AR overlay brings model-viewer's own WebGL
                  context, and this stage's would otherwise sit live underneath
                  it. @see the same gate on /product and /store. */}
              {canRender && !arOpen && config && modelPath && (
                <ShowroomStage
                  config={config}
                  modelPath={modelPath}
                  sourceRef={source}
                  plinth={featured.stage}
                  background={featured.viewer?.background}
                  onReady={handleReady}
                  onContextLost={recovery.handleContextLost}
                  downgrades={recovery.downgrades}
                  onError={handleError}
                />
              )}
              {!ready && (
                <div className="sr-viewer-fallback">
                  <SofaGhostIcon size={64} />
                  {recovery.lost ? (
                    <span>نمایش سه‌بعدی متوقف شد — حافظه گرافیکی دستگاه پر شد.</span>
                  ) : probe.state === 'missing' || failed ? (
                    <span>مدل سه‌بعدی این محصول در دسترس نیست.</span>
                  ) : (
                    <span>در حال بارگذاری مدل سه‌بعدی…</span>
                  )}
                </div>
              )}
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

      {arOpen && arPath && (
        <div className="sr-ar-host">
          <ARProductViewer
            glbPath={arPath}
            // Only for the catalogue model the USDZ was authored from; for a
            // cover variant, model-viewer builds Quick Look's USDZ from the GLB.
            usdzPath={arPath === presentation?.product.glbPath ? presentation?.product.usdzPath : undefined}
            productName={productName}
            arScale="fixed"
            onClose={() => setArOpen(false)}
          />
        </div>
      )}

      <RendererStatsOverlay />
    </section>
  )
}
