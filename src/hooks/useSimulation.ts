import { useCallback, useEffect, useRef, useState } from 'react'
import { Body, Explosion, SimEvent, Vec2 } from '../physics/types'
import { SimState, createSimulation, stepSimulation, resetSimulation } from '../physics/simulation'
import { computeAccelerations } from '../physics/gravity'
import { makeSolarSystemBodies, makeScenario, ScenarioId } from '../data/solar-system'
import { Camera, fitCamera, zoomCamera } from '../renderer/camera'
import { renderFrame, RenderOptions } from '../renderer/canvas'
import { computePredictedOrbit } from '../physics/orbital'

export const TIME_SCALES = [
  { label: '1×',    value: 1 / 365 },
  { label: '100×',  value: 0.1 },
  { label: '1K×',   value: 1 },
  { label: '10K×',  value: 10 },
  { label: '100K×', value: 100 },
  { label: '1M×',   value: 1000 },
]

export function useSimulation(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const initialBodies = useRef<Body[]>(makeSolarSystemBodies())
  const simRef    = useRef<SimState>(createSimulation(initialBodies.current))
  const accRef    = useRef<Vec2[]>(computeAccelerations(simRef.current.bodies))
  const camRef    = useRef<Camera>({ x: 0, y: 0, scale: 20 })
  const rafRef    = useRef<number>(0)
  const lastTimeRef   = useRef<number>(0)
  const pauseOnEventRef  = useRef(false)
  const selectedIdRef    = useRef<string | null>(null)
  const showArrowsRef    = useRef(true)
  const lastEventCountRef = useRef(0)
  const frameCountRef    = useRef(0)
  const explosionsRef    = useRef<Explosion[]>([])

  // Extra render options set by App (add-body ghost, etc.)
  const extraOptsRef = useRef<Partial<RenderOptions>>({})

  const [paused, setPaused] = useState(false)
  const [timeScaleIdx, setTimeScaleIdx] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [events, setEvents] = useState<SimEvent[]>([])
  const [pauseOnEvent, setPauseOnEvent] = useState(false)
  const [simYear, setSimYear] = useState(0)
  const [, forceRender] = useState(0)

  useEffect(() => { simRef.current.timeScale = TIME_SCALES[timeScaleIdx].value }, [timeScaleIdx])
  useEffect(() => { simRef.current.paused = paused }, [paused])
  useEffect(() => { pauseOnEventRef.current = pauseOnEvent }, [pauseOnEvent])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const loop = useCallback((now: number) => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(loop); return }
    const ctx = canvas.getContext('2d')!

    const dtReal = Math.min((now - lastTimeRef.current) / 1000, 0.05)
    lastTimeRef.current = now

    const prevEventCount = simRef.current.events.length
    const { newAcc, fired } = stepSimulation(simRef.current, accRef.current, dtReal, pauseOnEventRef.current)
    accRef.current = newAcc

    if (fired) setPaused(true)

    // Detect new collision events → create explosion entries
    if (simRef.current.events.length > prevEventCount) {
      const newEvs = simRef.current.events.slice(0, simRef.current.events.length - prevEventCount)
      for (const ev of newEvs) {
        if (ev.type === 'collision') {
          const body = simRef.current.bodies.find(b => ev.bodyIds.includes(b.id) && !b.ejected)
          if (body) {
            explosionsRef.current.push({
              worldX: body.pos.x,
              worldY: body.pos.y,
              color: body.color,
              startMs: now,
              durationMs: 1800,
            })
          }
        }
      }
    }

    // Purge finished explosions
    explosionsRef.current = explosionsRef.current.filter(ex => (now - ex.startMs) < ex.durationMs)

    frameCountRef.current++
    if (frameCountRef.current % 15 === 0) setSimYear(simRef.current.time)
    if (simRef.current.events.length !== lastEventCountRef.current) {
      lastEventCountRef.current = simRef.current.events.length
      setEvents([...simRef.current.events])
    }

    // Compute predicted orbit for selected body (every frame, cheap)
    let predictedOrbit: Vec2[] | null = null
    let selectedColor = '#ffffff'
    const selId = selectedIdRef.current
    if (selId) {
      const selBody = simRef.current.bodies.find(b => b.id === selId && !b.ejected)
      if (selBody) {
        selectedColor = selBody.color
        // Only compute every 3 frames to save CPU
        if (frameCountRef.current % 3 === 0) {
          predictedOrbit = computePredictedOrbit(selBody, simRef.current.bodies)
        }
      }
    }

    renderFrame(ctx, simRef.current.bodies, camRef.current, {
      selectedId: selId,
      showVelocityArrows: showArrowsRef.current,
      addingBody: extraOptsRef.current.addingBody ?? false,
      auPerPixel: 1 / camRef.current.scale,
      predictedOrbit,
      selectedColor,
      explosions: explosionsRef.current,
      nowMs: now,
      ghostWorldPos: extraOptsRef.current.ghostWorldPos ?? null,
      ghostScreenDrag: extraOptsRef.current.ghostScreenDrag ?? null,
    })

    rafRef.current = requestAnimationFrame(loop)
  }, [canvasRef])

  useEffect(() => {
    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [loop])

  const reset = useCallback((scenarioId: ScenarioId = 'default') => {
    initialBodies.current = makeScenario(scenarioId)
    accRef.current = resetSimulation(simRef.current, initialBodies.current)
    explosionsRef.current = []
    const w = canvasRef.current?.width ?? 1200
    const h = canvasRef.current?.height ?? 800
    const innerBodies = simRef.current.bodies.filter(b => {
      const d = Math.sqrt(b.pos.x * b.pos.x + b.pos.y * b.pos.y)
      return d < 12
    })
    camRef.current = innerBodies.length > 1
      ? fitCamera(innerBodies, w, h)
      : fitCamera(simRef.current.bodies, w, h)
    setPaused(false)
    setSelectedId(null)
    setEvents([])
    setSimYear(0)
    lastEventCountRef.current = 0
  }, [canvasRef])

  const fitView = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    camRef.current = fitCamera(simRef.current.bodies, canvas.width, canvas.height)
  }, [canvasRef])

  const zoomTo = useCallback((worldX: number, worldY: number, targetScale: number) => {
    camRef.current = { x: worldX, y: worldY, scale: targetScale }
  }, [])

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    camRef.current = zoomCamera(camRef.current, factor, e.clientX - rect.left, e.clientY - rect.top, canvas.width, canvas.height)
  }, [canvasRef])

  const modifyBody = useCallback((id: string, changes: Partial<Pick<Body, 'mass' | 'vel' | 'pos' | 'color' | 'visualRadius' | 'isStarOrMassive'>>) => {
    const b = simRef.current.bodies.find(b => b.id === id)
    if (!b) return
    Object.assign(b, changes)
    accRef.current = computeAccelerations(simRef.current.bodies)
    forceRender(n => n + 1)
  }, [])

  const removeBody = useCallback((id: string) => {
    const b = simRef.current.bodies.find(b => b.id === id)
    if (b) b.ejected = true
    accRef.current = computeAccelerations(simRef.current.bodies)
    setSelectedId(null)
    forceRender(n => n + 1)
  }, [])

  const addBody = useCallback((body: Body) => {
    simRef.current.bodies.push(body)
    accRef.current = computeAccelerations(simRef.current.bodies)
    forceRender(n => n + 1)
  }, [])

  // Let App inject extra per-frame render options (ghost body, etc.)
  const setExtraRenderOpts = useCallback((opts: Partial<RenderOptions>) => {
    extraOptsRef.current = opts
  }, [])

  return {
    simRef, camRef,
    paused, setPaused,
    timeScaleIdx, setTimeScaleIdx,
    selectedId, setSelectedId,
    events,
    pauseOnEvent, setPauseOnEvent,
    simYear,
    onWheel, reset, fitView, zoomTo,
    modifyBody, removeBody, addBody,
    setExtraRenderOpts,
  }
}
