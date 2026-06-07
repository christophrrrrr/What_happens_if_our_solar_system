import { useCallback, useEffect, useRef, useState } from 'react'
import { Body, SimEvent, Vec2 } from '../physics/types'
import { SimState, createSimulation, stepSimulation, resetSimulation } from '../physics/simulation'
import { computeAccelerations } from '../physics/gravity'
import { makeSolarSystemBodies, makeScenario, ScenarioId } from '../data/solar-system'
import { Camera, fitCamera, zoomCamera } from '../renderer/camera'
import { renderFrame } from '../renderer/canvas'

export const TIME_SCALES = [
  { label: '1×', value: 1 / 365 },          // 1 real day = 1 sim day
  { label: '100×', value: 0.1 },
  { label: '1K×', value: 1 },
  { label: '10K×', value: 10 },
  { label: '100K×', value: 100 },
  { label: '1M×', value: 1000 },
]

export function useSimulation(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const initialBodies = useRef<Body[]>(makeSolarSystemBodies())
  const simRef = useRef<SimState>(createSimulation(initialBodies.current))
  const accRef = useRef<Vec2[]>(computeAccelerations(simRef.current.bodies))
  const camRef = useRef<Camera>({ x: 0, y: 0, scale: 20 })
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const pauseOnEventRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)
  const showArrowsRef = useRef(true)
  const lastEventCountRef = useRef(0)
  const frameCountRef = useRef(0)

  const [paused, setPaused] = useState(false)
  const [timeScaleIdx, setTimeScaleIdx] = useState(1) // default 100×
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [events, setEvents] = useState<SimEvent[]>([])
  const [pauseOnEvent, setPauseOnEvent] = useState(false)
  const [simYear, setSimYear] = useState(0)
  const [, forceRender] = useState(0)

  // Keep refs in sync with state for use inside rAF
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

    const { newAcc, fired } = stepSimulation(simRef.current, accRef.current, dtReal, pauseOnEventRef.current)
    accRef.current = newAcc

    if (fired) setPaused(true)

    frameCountRef.current++

    // Update React state at 4 fps to avoid saturating the render queue
    if (frameCountRef.current % 15 === 0) {
      setSimYear(simRef.current.time)
    }
    // Only update event list when new events arrive
    if (simRef.current.events.length !== lastEventCountRef.current) {
      lastEventCountRef.current = simRef.current.events.length
      setEvents([...simRef.current.events])
    }

    renderFrame(ctx, simRef.current.bodies, camRef.current, {
      selectedId: selectedIdRef.current,
      showVelocityArrows: showArrowsRef.current,
      addingBody: false,
      auPerPixel: 1 / camRef.current.scale,
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
    const w = canvasRef.current?.width ?? 1200
    const h = canvasRef.current?.height ?? 800
    // Default view: fit to inner system (Sun → Saturn), so detail is visible.
    // "Fit" button shows the full system including outer planets.
    const innerBodies = simRef.current.bodies.filter(b => {
      const d = Math.sqrt(b.pos.x * b.pos.x + b.pos.y * b.pos.y)
      return d < 12 // AU — includes up to Saturn
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
    const canvas = canvasRef.current
    if (!canvas) return
    camRef.current = { x: worldX, y: worldY, scale: targetScale }
  }, [canvasRef])

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    camRef.current = zoomCamera(camRef.current, factor, e.clientX - rect.left, e.clientY - rect.top, canvas.width, canvas.height)
  }, [canvasRef])

  const modifyBody = useCallback((id: string, changes: Partial<Pick<Body, 'mass' | 'vel' | 'pos'>>) => {
    const b = simRef.current.bodies.find(b => b.id === id)
    if (!b) return
    if (changes.mass !== undefined) b.mass = changes.mass
    if (changes.vel !== undefined) b.vel = { ...b.vel, ...changes.vel }
    if (changes.pos !== undefined) b.pos = { ...b.pos, ...changes.pos }
    // Recompute accelerations after manual change
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

  return {
    simRef,
    camRef,
    paused, setPaused,
    timeScaleIdx, setTimeScaleIdx,
    selectedId, setSelectedId,
    events,
    pauseOnEvent, setPauseOnEvent,
    simYear,
    onWheel,
    reset,
    fitView,
    zoomTo,
    modifyBody,
    removeBody,
    addBody,
  }
}
