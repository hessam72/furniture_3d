'use client'
import dynamic from 'next/dynamic'
import { QualityProvider } from '@/contexts/QualityContext'

const StoreScene = dynamic(() => import('@/components/store/Scene'), {
  ssr: false,
})

export default function StorePage() {
  return (
    // Same provider (and persisted tier) as /car — one quality choice
    // drives both 3D experiences
    <QualityProvider>
      <div className="h-screen w-screen overflow-hidden">
        <StoreScene />
      </div>
    </QualityProvider>
  )
}
