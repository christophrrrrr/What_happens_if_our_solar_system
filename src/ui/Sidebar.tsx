import { useRef } from 'react'
import { Body } from '../physics/types'
import { OrbitalStats } from '../physics/orbital'

interface Props {
  body: Body
  allBodies: Body[]
  stats: OrbitalStats
  originalMass: number
  onMassChange: (mass: number) => void
  onVelChange: (vx: number, vy: number) => void
  onCircularOrbit: () => void
  onRemove: () => void
  onClose: () => void
  onZoomTo: () => void
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-gray-500 text-xs flex-shrink-0">{label}</span>
      <span className="text-gray-200 text-xs text-right font-mono">
        {value}
        {sub && <span className="text-gray-500 font-sans ml-1">{sub}</span>}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-gray-600 text-[10px] uppercase tracking-widest font-semibold pt-1">{title}</div>
      {children}
    </div>
  )
}

export function Sidebar({ body, stats, originalMass, onMassChange, onVelChange, onCircularOrbit, onRemove, onClose, onZoomTo }: Props) {
  const vxRef = useRef<HTMLInputElement>(null)
  const vyRef = useRef<HTMLInputElement>(null)

  const massMultiplier = originalMass > 0 ? body.mass / originalMass : 1

  return (
    <div className="w-64 bg-gray-950/95 backdrop-blur border border-gray-700 rounded-xl shadow-2xl flex flex-col text-sm overflow-y-auto max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: body.color === '#111111' ? '#555' : body.color }} />
          <span className="font-semibold text-white">{body.name}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      <div className="flex flex-col gap-4 p-4">

        {/* ORBIT section */}
        <Section title="Orbit">
          <Row label="Period" value={stats.periodDisplay} />
          <Row label="Distance" value={`${stats.distMkm.toFixed(1)}M km`} sub={`(${stats.distAU.toFixed(3)} AU)`} />
          <Row label="Speed" value={`${stats.speedKms.toFixed(1)} km/s`} />
          {stats.eccentricity !== null && (
            <Row label="Eccentricity" value={stats.eccentricity.toFixed(3)} sub={stats.eccentricity < 0.1 ? '(near circular)' : stats.eccentricity > 0.9 ? '(highly elliptical)' : ''} />
          )}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-gray-500 text-xs">Status</span>
            <span className="text-xs font-semibold" style={{ color: stats.statusColor }}>
              ● {stats.status}
            </span>
          </div>
        </Section>

        {/* BODY section */}
        <Section title="Body">
          <Row label="Mass" value={stats.massDisplay} />
          <Row label="Escape vel." value={`${stats.escapeVelKms.toFixed(1)} km/s`} />
          {stats.hillSphereMkm !== null && (
            <Row
              label="Hill sphere"
              value={stats.hillSphereMkm > 1 ? `${stats.hillSphereMkm.toFixed(1)}M km` : `${(stats.hillSphereMkm * 1000).toFixed(0)}K km`}
              sub="(max moon orbit)"
            />
          )}
        </Section>

        {/* MASS CONTROL */}
        <Section title="Mass">
          <div className="flex justify-between text-xs text-gray-400 mb-0.5">
            <span>Multiplier</span>
            <span className="text-gray-300 font-mono">{massMultiplier.toFixed(2)}×</span>
          </div>
          <input
            type="range" min={-2} max={2} step={0.01}
            value={Math.log10(massMultiplier)}
            onChange={e => {
              const mult = Math.pow(10, parseFloat(e.target.value))
              onMassChange(originalMass * mult)
            }}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>0.01×</span><span>1×</span><span>100×</span>
          </div>
        </Section>

        {/* VELOCITY */}
        <Section title="Velocity (AU/yr)">
          <div className="flex gap-2">
            {(['x', 'y'] as const).map((axis, i) => (
              <div key={axis} className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-500">V{axis}</label>
                <input
                  ref={i === 0 ? vxRef : vyRef}
                  type="number" step={0.1}
                  defaultValue={(i === 0 ? body.vel.x : body.vel.y).toFixed(3)}
                  key={body.id + '-v' + axis}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 w-full"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const vx = parseFloat(vxRef.current?.value ?? '0')
              const vy = parseFloat(vyRef.current?.value ?? '0')
              onVelChange(vx, vy)
            }}
            className="w-full px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
          >
            Apply velocity
          </button>
        </Section>

        {/* ACTIONS */}
        <Section title="Actions">
          <button
            onClick={onCircularOrbit}
            title="Set velocity to maintain a circular orbit at the current distance from the primary star"
            className="w-full px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 text-indigo-200 text-xs rounded transition-colors"
          >
            ⟳ Circularize orbit
          </button>
          <button
            onClick={onZoomTo}
            className="w-full px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
          >
            Zoom to {body.name}
          </button>
          <button
            onClick={onRemove}
            className="w-full px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 text-xs rounded transition-colors"
          >
            Remove {body.name}
          </button>
        </Section>

      </div>
    </div>
  )
}
