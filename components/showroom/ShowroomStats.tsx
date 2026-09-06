import type { ShowroomConfig } from '@/lib/showroom/config'
import Reveal from './Reveal'
import { Icon } from './icons'

/** The claims strip that overlaps the hero — support, delivery, 3D, brands. */
export default function ShowroomStats({ stats }: { stats: ShowroomConfig['stats'] }) {
  if (!stats?.length) return null

  return (
    <div className="sr-shell sr-stats-wrap" id="features">
      <Reveal className="sr-stats">
        {stats.map((stat) => (
          <div className="sr-stat" key={`${stat.icon}-${stat.value}`}>
            <Icon name={stat.icon} size={26} />
            <span className="sr-stat-value">{stat.value}</span>
            {stat.label && <span className="sr-stat-label">{stat.label}</span>}
            {stat.note && <span className="sr-stat-note">{stat.note}</span>}
          </div>
        ))}
      </Reveal>
    </div>
  )
}
