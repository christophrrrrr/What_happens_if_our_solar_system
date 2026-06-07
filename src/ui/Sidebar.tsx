import { useRef } from 'react'
import { Body } from '../physics/types'

interface Props {
  body: Body | null
  originalMass: number | null
  onMassChange: (mass: number) => void
  onVelChange: (vx: number, vy: number) => void
  onRemove: () => void
  onClose: () => void
  onZoomTo: () => void
}

function speed(b: Body) {
  return Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y).toFixed(3)
}

function dist(b: Body) {
  return Math.sqrt(b.pos.x * b.pos.x + b.pos.y * b.pos.y).toFixed(3)
}

export function Sidebar({ body, originalMass, onMassChange, onVelChange, onRemove, onClose, onZoomTo }: Props) {
  const vxRef = useRef<HTMLInputElement>(null)
  const vyRef = useRef<HTMLInputElement>(null)

  if (!body) return null

  const massMultiplier = originalMass ? body.mass / originalMass : 1

  return (
    <div className="w-64 bg-gray-950 border-l border-gray-800 flex flex-col text-sm overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: body.color }} />
          <span className="font-semibold text-white">{body.name}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-400">
          <span>Distance</span><span className="text-gray-200">{dist(body)} AU</span>
          <span>Speed</span><span className="text-gray-200">{speed(body)} AU/yr</span>
          <span>Mass</span><span className="text-gray-200">{body.mass.toExponential(2)} M☉</span>
        </div>

        {/* Mass slider */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Mass</span>
            <span className="text-gray-300">{massMultiplier.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={-2}
            max={2}
            step={0.01}
            value={Math.log10(massMultiplier)}
            onChange={e => {
              const mult = Math.pow(10, parseFloat(e.target.value))
              onMassChange((originalMass ?? body.mass) * mult)
            }}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>0.01×</span>
            <span>1×</span>
            <span>100×</span>
          </div>
        </div>

        {/* Velocity inputs */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-gray-400">Velocity (AU/yr)</span>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-500">Vx</label>
              <input
                ref={vxRef}
                type="number"
                step={0.1}
                defaultValue={body.vel.x.toFixed(3)}
                key={body.id + '-vx'}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 w-full"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-500">Vy</label>
              <input
                ref={vyRef}
                type="number"
                step={0.1}
                defaultValue={body.vel.y.toFixed(3)}
                key={body.id + '-vy'}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 w-full"
              />
            </div>
          </div>
          <button
            onClick={() => {
              const vx = parseFloat(vxRef.current?.value ?? '0')
              const vy = parseFloat(vyRef.current?.value ?? '0')
              onVelChange(vx, vy)
            }}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
          >
            Apply velocity
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={onZoomTo}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
          >
            Zoom to {body.name}
          </button>
          <button
            onClick={onRemove}
            className="px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 text-xs rounded transition-colors"
          >
            Remove {body.name}
          </button>
        </div>
      </div>
    </div>
  )
}
