'use client'
import dynamic from 'next/dynamic'
import { QualityProvider } from '@/contexts/QualityContext'
import { useContextRecovery } from '@/hooks/useContextRecovery'

const StoreScene = dynamic(() => import('@/components/store/Scene'), {
  ssr: false,
})

export default function StorePage() {
  /**
   * Held above the provider so the rungs a lost context costs reach the tier
   * that is resolved from them. This page had no `webglcontextlost` listener at
   * all until now — a lost context was a silent freeze, on the heaviest scene
   * in the app. @see useContextRecovery
   */
  const recovery = useContextRecovery({ surface: 'walkthrough' })

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
