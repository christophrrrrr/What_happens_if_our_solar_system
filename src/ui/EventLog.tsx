import { SimEvent } from '../physics/types'

interface Props {
  events: SimEvent[]
}

const TYPE_STYLE: Record<SimEvent['type'], string> = {
  collision: 'text-orange-400',
  ejection: 'text-red-400',
  capture: 'text-green-400',
  close_approach: 'text-yellow-500',
}

const TYPE_ICON: Record<SimEvent['type'], string> = {
  collision: '💥',
  ejection: '🚀',
  capture: '🔗',
  close_approach: '⚠',
}

function formatYear(y: number): string {
  if (y < 1) return `${Math.round(y * 365)}d`
  if (y < 1000) return `${y.toFixed(1)}yr`
  if (y < 1e6) return `${(y / 1000).toFixed(1)}Kyr`
  if (y < 1e9) return `${(y / 1e6).toFixed(1)}Myr`
  return `${(y / 1e9).toFixed(1)}Gyr`
}

export function EventLog({ events }: Props) {
  if (events.length === 0) return null

  return (
    <div className="absolute bottom-2 left-2 w-72 max-h-48 overflow-y-auto bg-gray-950/90 backdrop-blur border border-gray-800 rounded-lg text-xs">
      <div className="px-3 py-1.5 border-b border-gray-800 text-gray-500 font-medium">Events</div>
      {events.map((ev, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-1.5 border-b border-gray-900 last:border-0">
          <span className="flex-shrink-0 opacity-70">{TYPE_ICON[ev.type]}</span>
          <span className={`flex-1 ${TYPE_STYLE[ev.type]}`}>{ev.description}</span>
          <span className="flex-shrink-0 text-gray-600 font-mono">{formatYear(ev.time)}</span>
        </div>
      ))}
    </div>
  )
}
