'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type * as THREE from 'three'
import { useTranslations } from 'next-intl'
import type { PresentationConfig } from '@/lib/product/presentation'
import type { PlinthSpec } from '@/components/product/ViewerPlinth'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { useContextRecovery } from '@/hooks/useContextRecovery'
import { useGltfCacheEviction } from '@/hooks/useGltfCacheEviction'
import { webglUnavailable } from '@/lib/three/gpuClass'
import { RotateIcon, SofaGhostIcon } from '../icons'

const ShowroomStage = dynamic(() => import('../ShowroomStage'), {
  ssr: false,
  loading: () => null,
})

/**
 * The product page's turntable — the showroom homepage's inline viewer, same
 * stage, plinth and fallbacks, showing one piece exactly as its GLB was
 * authored: no swatches here, so nothing reads the shared paint store.
 *
 * The canvas mounts only once the plate nears the viewport. A WebGL context, a
 * GLB and an HDR are the heaviest things on the page, and a visitor reading the
 * specs may never scroll down to them. The HEAD probe runs at once — it is
 * cheap, and it lets a missing file say so before anyone arrives.
 */
export default function ProductViewer3D({
  config,
  model,
  plinth,
  background,
}: {
  config: PresentationConfig
  model: string
  /** The showroom's own stage, from its homepage. Omitted → the piece floats. */
  plinth?: PlinthSpec
  /** The showroom's canvas ground. Omitted → the stage's default. */
  background?: string
}) {
  const t = useTranslations('showroomProduct')
  const tc = useTranslations('common')
  const plate = useRef<HTMLDivElement>(null)
  const source = useRef<THREE.Object3D | null>(null)
  const [near, setNear] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const recovery = useContextRecovery({ surface: 'viewer' })

  /** Read after mount — the server cannot know, and a mismatch would break
   *  hydration. @see ShowroomFeatured for the same gate. */
  const [noWebgl, setNoWebgl] = useState(false)
  useEffect(() => setNoWebgl(webglUnavailable()), [])

  useEffect(() => {
    const node = plate.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setNear(true)
        observer.disconnect()
      },
      { rootMargin: '320px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const probe = useAssetProbe(useMemo(() => [model], [model]))
  useGltfCacheEviction([model])

  const handleReady = useCallback(() => setReady(true), [])
  const handleError = useCallback(() => setFailed(true), [])

  const canRender = near && probe.state === 'ready' && !failed && !recovery.lost && !noWebgl

  return (
    // Lenis listens for the wheel on the window; without this it scrolls the
    // page while OrbitControls dollies the piece. Touch is left to the browser.
    <div className="sr-stage" ref={plate} data-lenis-prevent-wheel>
      {canRender && (
        <ShowroomStage
          config={config}
          modelPath={model}
          sourceRef={source}
          plinth={plinth}
          background={background}
          paintable={false}
          onReady={handleReady}
          onError={handleError}
          onContextLost={recovery.handleContextLost}
          onDemote={recovery.demote}
          downgrades={recovery.downgrades}
        />
      )}

      {ready && canRender ? (
        <div className="sr-rotate-hint">
          <b className="sr-latin">360°</b>
          <RotateIcon size={18} />
          <span>{t('rotateHint')}</span>
        </div>
      ) : (
        <div className="sr-viewer-fallback">
          <SofaGhostIcon size={64} />
          {/* Most final first: an unsupported browser, a lost context, a
              missing or unreadable file — else it is still on its way. */}
          <span>
            {noWebgl
              ? tc('webglUnavailable')
              : recovery.lost
                ? t('gpuLost')
                : probe.state === 'missing' || failed
                  ? t('missing3d')
                  : t('loading3d')}
          </span>
        </div>
      )}
    </div>
  )
}
