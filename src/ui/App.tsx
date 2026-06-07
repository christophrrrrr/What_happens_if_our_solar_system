import { useCallback, useEffect, useRef, useState } from 'react'
import { useSimulation } from '../hooks/useSimulation'
import { TimeControls } from './TimeControls'
import { Toolbar } from './Toolbar'
import { Sidebar } from './Sidebar'
import { EventLog } from './EventLog'
import { screenToWorld, worldToScreen } from '../renderer/camera'
import { Body } from '../physics/types'
import { getVelocityArrowTip } from '../renderer/canvas'
import { ScenarioId } from '../data/solar-system'

const CLICK_RADIUS_PX = 12

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const sim = useSimulation(canvasRef)

  const [addingBody, setAddingBody] = useState(false)
  const [originalMasses, setOriginalMasses] = useState<Map<string, number>>(new Map())

  // Drag state refs (avoid re-renders during drag)
  const dragBodyIdRef = useRef<string | null>(null)
  const draggingVelRef = useRef(false)
  const dragStartRef = useRef<[number, number] | null>(null)

  // Fit on mount
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      sim.fitView()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [sim])

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', sim.onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', sim.onWheel)
  }, [sim.onWheel])

  // Record original masses when we first see a body (for mass slider)
  const ensureOriginalMass = useCallback((body: Body) => {
    setOriginalMasses(prev => {
      if (prev.has(body.id)) return prev
      const next = new Map(prev)
      next.set(body.id, body.mass)
      return next
    })
  }, [])

  const getBodyAtScreen = useCallback((sx: number, sy: number): Body | null => {
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

  const isNearVelArrow = useCallback((sx: number, sy: number, body: Body): boolean => {
    const canvas = canvasRef.current
    if (!canvas) return false
    const [tx, ty] = getVelocityArrowTip(body, sim.camRef.current, canvas.width, canvas.height)
    const dx = sx - tx, dy = sy - ty
    return dx * dx + dy * dy < 16 * 16
  }, [sim.camRef])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (addingBody) return // handled on mouseup

    const hit = getBodyAtScreen(sx, sy)

    if (hit && sim.selectedId === hit.id) {
      // Maybe dragging velocity arrow
      if (isNearVelArrow(sx, sy, hit)) {
        draggingVelRef.current = true
        dragBodyIdRef.current = hit.id
        dragStartRef.current = [sx, sy]
        return
      }
    }

    if (hit) {
      ensureOriginalMass(hit)
      sim.setSelectedId(hit.id)
      dragBodyIdRef.current = hit.id
      dragStartRef.current = [sx, sy]
    } else {
      // Start pan
      sim.setSelectedId(null)
      dragBodyIdRef.current = null
      dragStartRef.current = [sx, sy]
    }
  }, [addingBody, getBodyAtScreen, isNearVelArrow, sim, ensureOriginalMass])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!dragStartRef.current) return

    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [startX, startY] = dragStartRef.current

    if (draggingVelRef.current && dragBodyIdRef.current) {
      // Drag velocity arrow tip to set velocity
      const body = sim.simRef.current.bodies.find(b => b.id === dragBodyIdRef.current)
      if (body) {
        const [bx, by] = worldToScreen(sim.camRef.current, body.pos.x, body.pos.y, canvas.width, canvas.height)
        const ARROW_SCALE = 12
        const vx = (sx - bx) / ARROW_SCALE
        const vy = -(sy - by) / ARROW_SCALE
        sim.modifyBody(body.id, { vel: { x: vx, y: vy } })
      }
    } else if (dragBodyIdRef.current) {
      // Drag body position
      const body = sim.simRef.current.bodies.find(b => b.id === dragBodyIdRef.current)
      if (body) {
        const [wx, wy] = screenToWorld(sim.camRef.current, sx, sy, canvas.width, canvas.height)
        sim.modifyBody(body.id, { pos: { x: wx, y: wy } })
      }
    } else {
      // Pan camera
      const cam = sim.camRef.current
      const dx = (sx - startX) / cam.scale
      const dy = (sy - startY) / cam.scale
      sim.camRef.current = { ...cam, x: cam.x - dx, y: cam.y + dy }
      dragStartRef.current = [sx, sy]
    }
  }, [sim])

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (addingBody) {
      const [wx, wy] = screenToWorld(sim.camRef.current, sx, sy, canvas.width, canvas.height)
      const newBody: Body = {
        id: `custom-${Date.now()}`,
        name: 'Body',
        mass: 3e-6,
        pos: { x: wx, y: wy },
        vel: { x: 0, y: 0 },
        radius: 0.0003,
        visualRadius: 7,
        color: '#b388ff',
        isStarOrMassive: false,
        ejected: false,
        trail: new Array(1200).fill(null).map(() => ({ x: 0, y: 0 })),
        trailHead: 0,
        trailLen: 0,
      }
      sim.addBody(newBody)
      setOriginalMasses(prev => { const m = new Map(prev); m.set(newBody.id, newBody.mass); return m })
      sim.setSelectedId(newBody.id)
      setAddingBody(false)
    }

    draggingVelRef.current = false
    dragBodyIdRef.current = null
    dragStartRef.current = null
  }, [addingBody, sim])

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const hit = getBodyAtScreen(sx, sy)
    if (hit) {
      sim.zoomTo(hit.pos.x, hit.pos.y, hit.id === 'moon' ? 40000 : 3000)
    }
  }, [getBodyAtScreen, sim])

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sim.selectedId) {
      const focused = document.activeElement
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return
      sim.removeBody(sim.selectedId)
    }
    if (e.key === ' ') {
      e.preventDefault()
      sim.setPaused(p => !p)
    }
  }, [sim])

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  const selectedBody = sim.selectedId
    ? sim.simRef.current.bodies.find(b => b.id === sim.selectedId) ?? null
    : null

  const handleReset = (id: ScenarioId) => {
    sim.reset(id)
    setOriginalMasses(new Map())
    setAddingBody(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <Toolbar
        onReset={handleReset}
        addingBody={addingBody}
        onToggleAddBody={() => setAddingBody(a => !a)}
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
          {addingBody && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-blue-900/80 text-blue-200 text-xs rounded-full pointer-events-none">
              Click anywhere to place a new body
            </div>
          )}
        </div>

        {/* Sidebar */}
        {selectedBody && (
          <Sidebar
            body={selectedBody}
            originalMass={originalMasses.get(selectedBody.id) ?? selectedBody.mass}
            onMassChange={mass => sim.modifyBody(selectedBody.id, { mass })}
            onVelChange={(vx, vy) => sim.modifyBody(selectedBody.id, { vel: { x: vx, y: vy } })}
            onRemove={() => sim.removeBody(selectedBody.id)}
            onClose={() => sim.setSelectedId(null)}
            onZoomTo={() => sim.zoomTo(selectedBody.pos.x, selectedBody.pos.y, selectedBody.id === 'moon' ? 40000 : 3000)}
          />
        )}
      </div>
    </div>
  )
}
