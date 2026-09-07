'use client'

import Link from 'next/link'
import { useCallback, type MouseEvent, type ReactNode } from 'react'
import { useLenis } from '@/components/layout/LenisProvider'

/**
 * A link that glides to a section on this page, and behaves like an ordinary
 * `next/link` for anything else.
 *
 * The scroll goes through Lenis when it is running — the app installs it on
 * every route but /product, and a native `scrollIntoView` fights the smoothing
 * loop rather than riding it. Without Lenis it falls back to the native smooth
 * scroll, which also honours `prefers-reduced-motion` on its own.
 *
 * The offset is measured off the sticky header instead of assumed, so it stays
 * right when the header shrinks on a phone.
 */
export default function SmoothLink({
  href,
  className,
  children,
  onNavigate,
  'aria-label': ariaLabel,
}: {
  href: string
  className?: string
  children: ReactNode
  /** Called after a same-page jump — lets a mobile menu close itself. */
  onNavigate?: () => void
  'aria-label'?: string
}) {
  const lenis = useLenis()

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!href.startsWith('#')) return
      const target = document.querySelector(href)
      if (!target) return

      event.preventDefault()
      const header = document.querySelector('.sr-header')
      const offset = -((header?.getBoundingClientRect().height ?? 0) + 12)

      if (lenis) lenis.scrollTo(target as HTMLElement, { offset })
      else {
        const top = (target as HTMLElement).getBoundingClientRect().top + window.scrollY + offset
        window.scrollTo({ top, behavior: 'smooth' })
      }
      onNavigate?.()
    },
    [href, lenis, onNavigate]
  )

  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={handleClick}>
      {children}
    </Link>
  )
}
