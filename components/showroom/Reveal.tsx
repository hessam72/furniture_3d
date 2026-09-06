'use client'

import { useEffect, useRef, type ElementType, type ReactNode } from 'react'

/**
 * Fades a block up as it enters the viewport.
 *
 * One observer per block, disconnected on first entry: the reveal is a one-way
 * transition, so keeping the observer alive would only cost callbacks on every
 * later scroll past. The initial state lives in CSS (`[data-sr-reveal]`), so a
 * page with JS disabled still shows its content — `prefers-reduced-motion`
 * pins it visible there too.
 */
export default function Reveal({
  as: Tag = 'div',
  delay = 0,
  className,
  children,
}: {
  as?: ElementType
  /** Stagger, ms. */
  delay?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        node.dataset.srReveal = 'in'
        observer.disconnect()
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={className} data-sr-reveal="" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  )
}
