'use client'
import { useRef, useEffect } from 'react'
import { useShop } from '@/stores/storeShopStore'

/**
 * Ambient audio only — the mute control lives in StoreSidebar, driven through
 * the shared `muted` flag. It used to render its own corner button, which sat
 * exactly where the top bar's like/cart controls now are.
 */
export function AudioPlayer() {
  const muted = useShop((s) => s.muted)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.3
      audioRef.current.play().catch(() => {
        // Auto-play blocked, will play on user interaction
      })
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  return (
    <audio ref={audioRef} loop>
      <source src="/audio/background.mp3" type="audio/mpeg" />
    </audio>
  )
}
