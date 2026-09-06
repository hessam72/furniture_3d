'use client'

import { useEffect, useState } from 'react'

export type ProbeState = 'checking' | 'ready' | 'missing'

/**
 * HEAD-probe a set of URLs before mounting the 3D scene.
 *
 * `public/models` and `public/store-models` are gitignored, so a fresh clone or
 * a mis-typed manifest path would otherwise white-screen behind a Suspense
 * fallback that never resolves. Same guard `HomeARViewer` uses for AR assets.
 */
export function useAssetProbe(urls: string[]): { state: ProbeState; missing: string[] } {
  const key = urls.join('|')
  const [result, setResult] = useState<{ state: ProbeState; missing: string[] }>({
    state: 'checking',
    missing: [],
  })

  useEffect(() => {
    let cancelled = false
    const list = key ? key.split('|') : []
    if (!list.length) {
      setResult({ state: 'ready', missing: [] })
      return
    }

    setResult({ state: 'checking', missing: [] })

    Promise.all(
      list.map(async (url) => {
        try {
          const res = await fetch(url, { method: 'HEAD' })
          return res.ok ? null : url
        } catch {
          return url
        }
      })
    ).then((results) => {
      if (cancelled) return
      const missing = results.filter((u): u is string => !!u)
      setResult({ state: missing.length ? 'missing' : 'ready', missing })
    })

    return () => {
      cancelled = true
    }
  }, [key])

  return result
}
