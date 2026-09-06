'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { MdScreenRotation, MdScreenRotationAlt } from 'react-icons/md'

interface GyroToggleProps {
  onGyroChange: (enabled: boolean) => void
}

/** How long to wait for a real sensor reading before giving up */
const SENSOR_PROBE_MS = 1000

export function GyroToggle({ onGyroChange }: GyroToggleProps) {
  const [isGyroEnabled, setIsGyroEnabled] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const probeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // The constructor exists in desktop Chrome/Firefox too, where no sensor
    // ever fires — require a touch device so the button isn't a desktop no-op
    if (
      typeof window !== 'undefined' &&
      'DeviceOrientationEvent' in window &&
      window.matchMedia('(pointer: coarse)').matches
    ) {
      setIsSupported(true)
    }
  }, [])

  const disable = useCallback(() => {
    setIsGyroEnabled(false)
    onGyroChange(false)
  }, [onGyroChange])

  // Enabling only means "we asked" — confirm a reading actually arrives,
  // otherwise the camera silently freezes with the toggle lit up
  const enable = useCallback(() => {
    setIsGyroEnabled(true)
    onGyroChange(true)

    const onFirstReading = (e: DeviceOrientationEvent) => {
      if (e.alpha === null && e.beta === null && e.gamma === null) return
      cleanup()
    }
    const cleanup = () => {
      window.removeEventListener('deviceorientation', onFirstReading)
      if (probeRef.current) clearTimeout(probeRef.current)
      probeRef.current = null
    }

    window.addEventListener('deviceorientation', onFirstReading, { passive: true })
    probeRef.current = setTimeout(() => {
      cleanup()
      disable()
      console.warn('[GyroToggle] no deviceorientation readings — sensor unavailable')
    }, SENSOR_PROBE_MS)
  }, [onGyroChange, disable])

  useEffect(() => () => {
    if (probeRef.current) clearTimeout(probeRef.current)
  }, [])

  const requestPermission = async () => {
    if (!isSupported) return

    try {
      // iOS 13+ requires explicit permission
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const permission = await (DeviceOrientationEvent as any).requestPermission()
        if (permission === 'granted') {
          enable()
        } else {
          console.warn('[GyroToggle] device orientation permission denied')
        }
      } else {
        // Non-iOS or older browsers - permission not required
        enable()
      }
    } catch (error) {
      console.error('Error requesting device orientation permission:', error)
    }
  }

  const toggleGyro = () => {
    if (isGyroEnabled) {
      if (probeRef.current) clearTimeout(probeRef.current)
      disable()
    } else {
      requestPermission()
    }
  }

  // Don't render on desktop or unsupported devices
  if (!isSupported) return null

  return (
    <button
      onClick={toggleGyro}
      style={{
            position: 'absolute' ,
    right: '3.5rem' ,
    top: '.15rem' ,
      }}
      aria-pressed={isGyroEnabled}
      // Positioning belongs to StoreTopBar, which lays this out beside the
      // like/cart controls — the toggle used to float in the corner the
      // hamburger now occupies
      className={`glass specular pointer-events-auto grid h-10 w-10 place-items-center rounded-full transition-colors duration-200 active:scale-95 ${
        isGyroEnabled
          ? 'text-[var(--gold-primary)]'
          : 'text-[var(--text-primary)] hover:text-[var(--gold-primary)]'
      }`}
      aria-label={isGyroEnabled ? 'Disable gyroscope controls' : 'Enable gyroscope controls'}
    >
      {isGyroEnabled ? <MdScreenRotationAlt size={18} /> : <MdScreenRotation size={18} />}
    </button>
  )
}
