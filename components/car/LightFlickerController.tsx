'use client'

import { ReactNode } from 'react'
import { MotionValue } from 'framer-motion'
import { useLightFlicker } from '@/hooks/useLightFlicker'
import { ConditionalEnvironment } from './ConditionalEnvironment'
import CarLighting from './CarLighting'

interface LightFlickerControllerProps {
  scrollProgress: MotionValue<number>
  children: ReactNode
}

/**
 * Controller component that manages light flicker state inside Canvas
 * and distributes data to lighting components
 */
export function LightFlickerController({ scrollProgress, children }: LightFlickerControllerProps) {
  const lightFlickerData = useLightFlicker(scrollProgress)

  return (
    <>
      <ConditionalEnvironment flickerData={lightFlickerData} />
      <CarLighting flickerData={lightFlickerData} />
      {children}
    </>
  )
}
