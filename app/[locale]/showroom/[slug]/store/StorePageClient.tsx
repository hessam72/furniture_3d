'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { QualityProvider } from '@/contexts/QualityContext'
import { useContextRecovery } from '@/hooks/useContextRecovery'
import { webglUnavailable } from '@/lib/three/gpuClass'

const StoreScene = dynamic(() => import('@/components/store/Scene'), {
  ssr: false,
})

export default function StorePageClient() {
  /**
   * Held above the provider so the rungs a lost context costs reach the tier
   * that is resolved from them. This page had no `webglcontextlost` listener at
   * all until now — a lost context was a silent freeze, on the heaviest scene
   * in the app. @see useContextRecovery
   */
  const recovery = useContextRecovery({ surface: 'walkthrough' })
  const tc = useTranslations('common')

  /**
   * No WebGL2 on this device at all — mirrors SimpleViewerClient's own check.
   * Read in an effect, not the initialiser: this is page chrome that does
   * server-render, and a value that differs between the server's HTML and the
   * client's first render is a hydration mismatch. @see readGpuClass
   */
  const [noWebgl, setNoWebgl] = useState(false)
  useEffect(() => setNoWebgl(webglUnavailable()), [])

  if (noWebgl) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#060608] p-6 text-center">
        <p className="max-w-sm text-sm text-white/55">{tc('webglUnavailable')}</p>
      </div>
    )
  }

  return (
    // The visitor's remembered choice drives this page — a walkable scene's
    // cost depends on where they walk, so their judgement beats any default.
    // The `walkthrough` ceiling is what stops that choice being a tier the
    // handset cannot hold. @see SURFACE_POLICY
    <QualityProvider surface="walkthrough" downgrades={recovery.downgrades}>
      <div className="h-screen w-screen overflow-hidden">
        <StoreScene recovery={recovery} />
      </div>
    </QualityProvider>
  )
}
