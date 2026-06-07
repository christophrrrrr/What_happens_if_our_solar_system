import { ScenarioId, BodyPresetKey } from '../data/solar-system'

interface Props {
  onReset: (id: ScenarioId) => void
  addingBody: boolean
  selectedPreset: BodyPresetKey
  onToggleAddBody: () => void
  onSelectPreset: (k: BodyPresetKey) => void
}

const SCENARIOS: { id: ScenarioId; label: string; desc: string }[] = [
  { id: 'default',      label: 'Solar System',   desc: 'Reset to the real solar system' },
  { id: 'no-jupiter',   label: 'No Jupiter',     desc: 'Remove Jupiter — inner solar system slowly destabilizes' },
  { id: 'double-sun',   label: '2× Sun',         desc: 'Double the Sun\'s mass — orbits shrink, planets speed up' },
  { id: 'earth-at-mars',label: 'Earth→Mars',     desc: 'Move Earth to Mars\'s orbit (1.524 AU)' },
  { id: 'rogue-planet', label: 'Rogue Planet',   desc: 'A massive intruder flies through the inner system' },
  { id: 'sun-blackhole',label: 'Sun→Black Hole', desc: 'Same mass — planets keep orbiting! Black holes don\'t "suck".' },
  { id: 'binary-star',  label: 'Binary Stars',   desc: 'Add a second star at 8 AU — orbits go chaotic over centuries' },
  { id: 'heavy-earth',  label: 'Heavy Earth',    desc: 'Give Earth Jupiter\'s mass — Moon escapes, Venus & Mars perturbed' },
]

const FIXED_SCENARIOS = SCENARIOS

const PRESETS: { key: BodyPresetKey; icon: string; label: string; hint: string }[] = [
  { key: 'planet',    icon: '🌍', label: 'Planet',     hint: 'Earth-mass rocky body' },
  { key: 'gas_giant', icon: '⛽', label: 'Gas Giant',  hint: 'Jupiter-mass, strong gravity' },
  { key: 'star',      icon: '☀️', label: 'Star',       hint: '1 solar mass, glowing' },
  { key: 'black_hole',icon: '◼', label: 'Black Hole', hint: '10× solar mass + visual effect' },
  { key: 'comet',     icon: '☄️', label: 'Comet',      hint: 'Tiny, fast-moving' },
]

export function Toolbar({ onReset, addingBody, selectedPreset, onToggleAddBody, onSelectPreset }: Props) {
  return (
    <div className="bg-gray-950 border-b border-gray-800 select-none">
      {/* Scenario row */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
        <span className="text-gray-500 flex-shrink-0">Scenario:</span>
        {FIXED_SCENARIOS.map(s => (
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
          className={`px-2.5 py-1 rounded flex-shrink-0 transition-colors font-medium ${
            addingBody
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title="Click canvas then drag to throw a new body"
        >
          + Add body
        </button>
      </div>

      {/* Body type picker — only visible when add-body mode is on */}
      {addingBody && (
        <div className="flex items-center gap-2 px-4 pb-2 text-xs border-t border-gray-800/60">
          <span className="text-gray-500 mt-1.5">Type:</span>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => onSelectPreset(p.key)}
                title={p.hint}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                  selectedPreset === p.key
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          <span className="ml-2 mt-1.5 text-gray-600 italic">
            Click canvas to place, drag to set velocity
          </span>
        </div>
      )}
    </div>
  )
}
