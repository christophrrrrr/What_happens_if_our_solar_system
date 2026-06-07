import { useCallback, useEffect, useRef, useState } from 'react'
import { useSimulation } from '../hooks/useSimulation'
import { TimeControls } from './TimeControls'
import { Toolbar } from './Toolbar'
import { Sidebar } from './Sidebar'
import { EventLog } from './EventLog'
import { screenToWorld, worldToScreen } from '../renderer/camera'
import { Body, BodyPresetKey } from '../physics/types'
import { getVelocityArrowTip, ARROW_SCALE } from '../renderer/canvas'
import { ScenarioId, makeBodyFromPreset } from '../data/solar-system'
import { getOrbitalStats, circularOrbitVelocity } from '../physics/orbital'
import { TRAIL_CAPACITY } from '../physics/constants'

const CLICK_RADIUS_PX = 12

export default function App() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const sim = useSimulation(canvasRef)

  // ─── Add-body state ────────────────────────────────────────────────────────
  const [addingBody, setAddingBody]     = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<BodyPresetKey>('planet')
  // 'idle' | 'dragging'
  const addPhaseRef     = useRef<'idle' | 'dragging'>('idle')
  const pendingWorldRef = useRef<{ x: number; y: number } | null>(null)
  const pendingScreenRef = useRef<{ x: number; y: number } | null>(null)

  // ─── General drag state ────────────────────────────────────────────────────
  const [originalMasses, setOriginalMasses] = useState<Map<string, number>>(new Map())
  const dragBodyIdRef   = useRef<string | null>(null)
  const draggingVelRef  = useRef(false)
  const dragStartRef    = useRef<[number, number] | null>(null)

  // ─── Initial canvas sizing ─────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      canvas.width  = container.clientWidth
      canvas.height = container.clientHeight
    }
    const rafId = requestAnimationFrame(() => {
      resize()
      sim.reset('default')
    })
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', resize) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', sim.onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', sim.onWheel)
  }, [sim.onWheel])

  // ─── Push extra render options every time add-body state changes ───────────
  useEffect(() => {
    sim.setExtraRenderOpts({
      addingBody,
      ghostWorldPos: null,
      ghostScreenDrag: null,
    })
  }, [addingBody, sim])

  // ─── Helper: get world coords from screen event ────────────────────────────
  const toWorld = useCallback((sx: number, sy: number): [number, number] => {
    const canvas = canvasRef.current!
    return screenToWorld(sim.camRef.current, sx, sy, canvas.width, canvas.height)
  }, [sim.camRef])

  // ─── Helper: find body at screen position ──────────────────────────────────
  const getBodyAt = useCallback((sx: number, sy: number): Body | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const cam = sim.camRef.current
    const bodies = sim.simRef.current.bodies
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i]
      if (b.ejected) continue
      const [bx, by] = worldToScreen(cam, b.pos.x, b.pos.y, canvas.width, canvas.height)
      const dx = sx - bx, dy = sy - by
      const hit = Math.max(b.visualRadius, CLICK_RADIUS_PX)
      if (dx * dx + dy * dy < hit * hit) return b
    }
    return null
  }, [sim.camRef, sim.simRef])

  const ensureOriginalMass = useCallback((body: Body) => {
    setOriginalMasses(prev => {
      if (prev.has(body.id)) return prev
      const next = new Map(prev)
      next.set(body.id, body.mass)
      return next
    })
  }, [])

  // ─── Mouse down ────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (addingBody) {
      // Start placing: record world position, enter dragging phase
      const [wx, wy] = toWorld(sx, sy)
      pendingWorldRef.current = { x: wx, y: wy }
      pendingScreenRef.current = { x: sx, y: sy }
      addPhaseRef.current = 'dragging'
      return
    }

    const hit = getBodyAt(sx, sy)
    if (hit) {
      ensureOriginalMass(hit)
      sim.setSelectedId(hit.id)
      // Check if clicking near velocity arrow tip
      const canvas = canvasRef.current!
      const [tx, ty] = getVelocityArrowTip(hit, sim.camRef.current, canvas.width, canvas.height)
      const dax = sx - tx, day = sy - ty
      if (sim.selectedId === hit.id && dax * dax + day * day < 16 * 16) {
        draggingVelRef.current = true
      }
      dragBodyIdRef.current = hit.id
      dragStartRef.current = [sx, sy]
    } else {
      sim.setSelectedId(null)
      dragBodyIdRef.current = null
      dragStartRef.current = [sx, sy]
    }
  }, [addingBody, toWorld, getBodyAt, ensureOriginalMass, sim])

  // ─── Mouse move ────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    // Add-body drag: show ghost + arrow
    if (addingBody && addPhaseRef.current === 'dragging' && pendingWorldRef.current) {
      sim.setExtraRenderOpts({
        addingBody: true,
        ghostWorldPos: pendingWorldRef.current,
        ghostScreenDrag: { x: sx, y: sy },
      })
      return
    }

    if (!dragStartRef.current) return
    const canvas = canvasRef.current!

    if (draggingVelRef.current && dragBodyIdRef.current) {
      const body = sim.simRef.current.bodies.find(b => b.id === dragBodyIdRef.current)
      if (body) {
        const [bx, by] = worldToScreen(sim.camRef.current, body.pos.x, body.pos.y, canvas.width, canvas.height)
        sim.modifyBody(body.id, { vel: { x: (sx - bx) / ARROW_SCALE, y: -((sy - by) / ARROW_SCALE) } })
      }
    } else if (dragBodyIdRef.current) {
      const body = sim.simRef.current.bodies.find(b => b.id === dragBodyIdRef.current)
      if (body) {
        const [wx, wy] = toWorld(sx, sy)
        sim.modifyBody(body.id, { pos: { x: wx, y: wy } })
      }
    } else {
      // Pan camera
      const [startX, startY] = dragStartRef.current
      const cam = sim.camRef.current
      sim.camRef.current = { ...cam, x: cam.x - (sx - startX) / cam.scale, y: cam.y + (sy - startY) / cam.scale }
      dragStartRef.current = [sx, sy]
    }
  }, [addingBody, sim, toWorld])

  // ─── Mouse up ──────────────────────────────────────────────────────────────
  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (addingBody && addPhaseRef.current === 'dragging' && pendingWorldRef.current) {
      const startScreen = pendingScreenRef.current!
      // Velocity from drag: screen delta / ARROW_SCALE
      const vel = {
        x: (sx - startScreen.x) / ARROW_SCALE,
        y: -((sy - startScreen.y) / ARROW_SCALE),
      }
      const newBody = makeBodyFromPreset(
        selectedPreset,
        `custom-${Date.now()}`,
        pendingWorldRef.current,
        vel,
      )
      // Init trail buffer
      newBody.trail = new Array(TRAIL_CAPACITY).fill(null).map(() => ({ x: 0, y: 0 }))
      sim.addBody(newBody)
      sim.setSelectedId(newBody.id)
      ensureOriginalMass(newBody)
      setOriginalMasses(prev => {
        const m = new Map(prev)
        m.set(newBody.id, newBody.mass)
        return m
      })
      // Reset add-body phase
      addPhaseRef.current = 'idle'
      pendingWorldRef.current = null
      pendingScreenRef.current = null
      sim.setExtraRenderOpts({ addingBody: true, ghostWorldPos: null, ghostScreenDrag: null })
      // Stay in add-body mode for multi-add
    } else {
      draggingVelRef.current = false
      dragBodyIdRef.current = null
      dragStartRef.current = null
    }
  }, [addingBody, selectedPreset, sim, ensureOriginalMass])

  // ─── Double-click: zoom to body ────────────────────────────────────────────
  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const hit = getBodyAt(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) sim.zoomTo(hit.pos.x, hit.pos.y, hit.id === 'moon' ? 40000 : 3000)
  }, [getBodyAt, sim])

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAddingBody(false); addPhaseRef.current = 'idle' }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sim.selectedId) {
        if (document.activeElement?.tagName === 'INPUT') return
        sim.removeBody(sim.selectedId)
      }
      if (e.key === ' ') { e.preventDefault(); sim.setPaused(p => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  // ─── Derived data ──────────────────────────────────────────────────────────
  const selectedBody = sim.selectedId
    ? sim.simRef.current.bodies.find(b => b.id === sim.selectedId && !b.ejected) ?? null
    : null

  const orbitalStats = selectedBody
    ? getOrbitalStats(selectedBody, sim.simRef.current.bodies)
    : null

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleReset = (id: ScenarioId) => {
    sim.reset(id)
    setOriginalMasses(new Map())
    setAddingBody(false)
    addPhaseRef.current = 'idle'
  }

  const handleToggleAddBody = () => {
    const next = !addingBody
    setAddingBody(next)
    addPhaseRef.current = 'idle'
    pendingWorldRef.current = null
    sim.setExtraRenderOpts({ addingBody: next, ghostWorldPos: null, ghostScreenDrag: null })
  }

  const handleCircularOrbit = () => {
    if (!selectedBody) return
    const vel = circularOrbitVelocity(selectedBody, sim.simRef.current.bodies)
    sim.modifyBody(selectedBody.id, { vel })
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <Toolbar
        onReset={handleReset}
        addingBody={addingBody}
        selectedPreset={selectedPreset}
        onToggleAddBody={handleToggleAddBody}
        onSelectPreset={setSelectedPreset}
      />
      <TimeControls
        paused={sim.paused}
        onTogglePause={() => sim.setPaused(p => !p)}
        timeScaleIdx={sim.timeScaleIdx}
        onTimeScale={sim.setTimeScaleIdx}
        simYear={sim.simYear}
        pauseOnEvent={sim.pauseOnEvent}
        onTogglePauseOnEvent={() => sim.setPauseOnEvent(p => !p)}
        onFitView={sim.fitView}
      />

      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 relative"
          style={{ cursor: addingBody ? 'crosshair' : 'default' }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDoubleClick={onDoubleClick}
          />
          <EventLog events={sim.events} />
        </div>

        {/* Sidebar */}
        {selectedBody && orbitalStats && (
          <Sidebar
            body={selectedBody}
            allBodies={sim.simRef.current.bodies}
            stats={orbitalStats}
            originalMass={originalMasses.get(selectedBody.id) ?? selectedBody.mass}
            onMassChange={mass => sim.modifyBody(selectedBody.id, { mass })}
            onVelChange={(vx, vy) => sim.modifyBody(selectedBody.id, { vel: { x: vx, y: vy } })}
            onCircularOrbit={handleCircularOrbit}
            onRemove={() => sim.removeBody(selectedBody.id)}
            onClose={() => sim.setSelectedId(null)}
            onZoomTo={() => sim.zoomTo(selectedBody.pos.x, selectedBody.pos.y, selectedBody.id === 'moon' ? 40000 : 3000)}
          />
        )}
      </div>
    </div>
  )
}
