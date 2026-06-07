import { TIME_SCALES } from '../hooks/useSimulation'

interface Props {
  paused: boolean
  onTogglePause: () => void
  timeScaleIdx: number
  onTimeScale: (idx: number) => void
  simYear: number
  pauseOnEvent: boolean
  onTogglePauseOnEvent: () => void
  onFitView: () => void
}

function formatYear(y: number): string {
  const abs = Math.abs(y)
  if (abs < 1) return `${Math.round(y * 365)} days`
  if (abs < 1000) return `${y.toFixed(1)} yrs`
  if (abs < 1e6) return `${(y / 1000).toFixed(1)}K yrs`
  if (abs < 1e9) return `${(y / 1e6).toFixed(2)}M yrs`
  return `${(y / 1e9).toFixed(3)}B yrs`
}

export function TimeControls({ paused, onTogglePause, timeScaleIdx, onTimeScale, simYear, pauseOnEvent, onTogglePauseOnEvent, onFitView }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-950 border-b border-gray-800 select-none">
      {/* Play/Pause */}
      <button
        onClick={onTogglePause}
        className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-white transition-colors"
        title={paused ? 'Resume' : 'Pause'}
      >
        {paused ? '▶' : '⏸'}
      </button>

      {/* Time scale presets */}
      <div className="flex gap-1">
        {TIME_SCALES.map((ts, i) => (
          <button
            key={ts.label}
            onClick={() => onTimeScale(i)}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              i === timeScaleIdx
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {ts.label}
          </button>
        ))}
      </div>

      {/* Sim time */}
      <span className="font-mono text-xs text-gray-300 min-w-[90px]">
        T + {formatYear(simYear)}
      </span>

      <div className="flex-1" />

      {/* Pause on event toggle */}
      <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={pauseOnEvent}
          onChange={onTogglePauseOnEvent}
          className="accent-blue-500"
        />
        Pause on event
      </label>

      {/* Fit view */}
      <button
        onClick={onFitView}
        className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
        title="Fit entire system in view"
      >
        Fit
      </button>
    </div>
  )
}
