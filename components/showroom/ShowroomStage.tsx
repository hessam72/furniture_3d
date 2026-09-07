'use client'

import { useEffect, useMemo, useState } from 'react'
import type * as THREE from 'three'
import { QualityProvider } from '@/contexts/QualityContext'
import {
  PHONE_QUERY,
  readDeviceClass,
  simpleViewerQuality,
  TOUCH_QUERY,
  type DeviceClass,
  type PresentationConfig,
} from '@/lib/product/presentation'
import SimpleViewer from '@/components/product/SimpleViewer'
import type { PlinthSpec } from '@/components/product/ViewerPlinth'

/**
 * The canvas half of the featured section: /product/[id]/simple's viewer,
 * embedded in a page rather than owning the screen.
 *
 * Everything that makes that page cheap applies here unchanged — one GLB, one
 * HDR, no shadow map, no composer, and a demand loop that parks the moment the
 * pointer settles — which is what makes it affordable on a marketing page that
 * also carries a hero image and a slider.
 *
 * `coverage` is 0: the page's controls sit beside the canvas, not over it, so
 * the piece is framed into the whole stage rather than into a band above a
 * sheet.
 */
/** The canvas clear colour. Matched by `.sr-stage`'s own ground so the square
 *  canvas disappears into the rounded plate it sits on. */
export const STAGE_BG = '#f6f7f9'

export default function ShowroomStage({
  config,
  modelPath,
  sourceRef,
  plinth,
  background = STAGE_BG,
  onReady,
  onError,
}: {
  config: PresentationConfig
  /** Which GLB to show — a cover variant, or the bare frame. */
  modelPath: string
  sourceRef: React.MutableRefObject<THREE.Object3D | null>
  /** The stage the piece stands on. Omitted → it floats, as on the plain page. */
  plinth?: PlinthSpec
  /** Canvas ground, from the showroom's own JSON. Omitted → `STAGE_BG`, which
   *  is the colour the CSS plate under it is cut in. @see ShowroomViewer */
  background?: string
  onReady: () => void
  onError: (category: string, error: Error) => void
}) {
  const [device, setDevice] = useState<DeviceClass>('desktop')

  useEffect(() => {
    const queries = [window.matchMedia(PHONE_QUERY), window.matchMedia(TOUCH_QUERY)]
    const apply = () => setDevice(readDeviceClass())
    apply()
    queries.forEach((mq) => mq.addEventListener('change', apply))
    return () => queries.forEach((mq) => mq.removeEventListener('change', apply))
  }, [])

  /** The manifest, with the shown layer swapped in. `simpleViewer()` reads
   *  `simple.model`, so overriding it here is the whole layer switch — no
   *  second code path, and every other value the product authored survives. */
  const viewConfig = useMemo<PresentationConfig>(
    () => ({
      ...config,
      simple: {
        ...config.simple,
        model: modelPath,
        background,
        // Room for the plinth, which reaches past the piece on every side.
        padding: plinth ? (config.simple?.padding ?? 1.1) * 1.12 : config.simple?.padding,
      },
    }),
    [config, modelPath, plinth, background]
  )

  return (
    <QualityProvider preset={simpleViewerQuality(config, device)}>
      <SimpleViewer
        config={viewConfig}
        coverage={0}
        onReady={onReady}
        onError={onError}
        sourceRef={sourceRef}
        plinth={plinth}
        /* A showroom turntable: drag spins the piece, it never tips. */
        lockPolar
        embedded
      />
    </QualityProvider>
  )
}
