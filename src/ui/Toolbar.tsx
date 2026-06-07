import { ScenarioId } from '../data/solar-system'

interface Props {
  onReset: (id: ScenarioId) => void
  addingBody: boolean
  onToggleAddBody: () => void
}

const SCENARIOS: { id: ScenarioId; label: string; desc: string }[] = [
  { id: 'default', label: 'Solar System', desc: 'Reset to the real solar system' },
  { id: 'no-jupiter', label: 'No Jupiter', desc: 'Remove Jupiter and watch the inner solar system destabilize' },
  { id: 'double-sun', label: '2× Sun', desc: 'Double the Sun\'s mass' },
  { id: 'earth-at-mars', label: 'Earth→Mars', desc: 'Move Earth to Mars\'s orbit' },
  { id: 'rogue-planet', label: 'Rogue Planet', desc: 'Fling a massive intruder into the system' },
]

export function Toolbar({ onReset, addingBody, onToggleAddBody }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-gray-950 border-b border-gray-800 text-xs select-none">
      <span className="text-gray-500 flex-shrink-0">Scenario:</span>
      {SCENARIOS.map(s => (
        <button
          key={s.id}
          onClick={() => onReset(s.id)}
          title={s.desc}
          className={`px-2.5 py-1 rounded flex-shrink-0 transition-colors ${
            s.id === 'default'
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
        >
          {s.label}
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={onToggleAddBody}
        className={`px-2.5 py-1 rounded flex-shrink-0 transition-colors ${
          addingBody
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
        }`}
        title="Click the canvas to place a new body"
      >
        + Add body
      </button>
    </div>
  )
}
