'use client'
import dynamic from 'next/dynamic'
import { QualityProvider } from '@/contexts/QualityContext'

const StoreScene = dynamic(() => import('@/components/store/Scene'), {
  ssr: false,
})

export default function StorePage() {
  return (
    // The visitor's remembered choice drives this page — a walkable scene's
    // cost depends on where they walk, so their judgement beats any default.
    // The `walkthrough` ceiling is what stops that choice being a tier the
    // handset cannot hold. @see SURFACE_POLICY
    <QualityProvider surface="walkthrough">
      <div className="h-screen w-screen overflow-hidden">
        <StoreScene />
      </div>
    </QualityProvider>
  )
}
