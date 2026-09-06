'use client'

import './showroom.css'
import type { ResolvedShowroom } from '@/lib/showroom/config'
import ShowroomHeader from './ShowroomHeader'
import ShowroomHero from './ShowroomHero'
import ShowroomStats from './ShowroomStats'
import ShowroomFeatured from './ShowroomFeatured'
import ShowroomVirtual from './ShowroomVirtual'
import ShowroomCollection from './ShowroomCollection'
import ShowroomClosing from './ShowroomClosing'
import ShowroomFooter from './ShowroomFooter'

/**
 * A brand's homepage, assembled from its JSON entry.
 *
 * `dir`/`lang` are set on this wrapper rather than assumed from the document:
 * the host layout is a single-locale shell, and scoping them here keeps a
 * future latin-script brand from turning the rest of the site around. Same
 * reason `.sr-root` carries the light theme rather than the document.
 */
export default function ShowroomPage({ showroom }: { showroom: ResolvedShowroom }) {
  const { config, presentation } = showroom

  return (
    <div className="sr-root" dir="rtl" lang="fa">
      <ShowroomHeader config={config} />

      <main>
        <ShowroomHero config={config} />
        <ShowroomStats stats={config.stats} />
        <ShowroomFeatured featured={config.featured} presentation={presentation} />
        <ShowroomVirtual virtual={config.virtual} />
        <ShowroomCollection collection={config.collection} />
        {config.closing && <ShowroomClosing closing={config.closing} />}
      </main>

      <ShowroomFooter config={config} />
    </div>
  )
}
