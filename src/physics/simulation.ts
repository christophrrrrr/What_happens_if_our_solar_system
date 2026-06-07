import { Body, SimEvent, Vec2 } from './types'
import { computeAccelerations } from './gravity'
import { leapfrogStep } from './integrator'
import { detectEvents } from './events'
import { TRAIL_CAPACITY } from './constants'

export interface SimState {
  bodies: Body[]
  time: number        // years since epoch
  events: SimEvent[]
  paused: boolean
  timeScale: number   // simulated years per real second
}

const EVENT_LOG_MAX = 200

export function createSimulation(initialBodies: Body[]): SimState {
  const bodies = deepCloneBodies(initialBodies)
  bodies.forEach(initTrail)
  return {
    bodies,
    time: 0,
    events: [],
    paused: false,
    timeScale: 1,
  }
}

// At high time scales (>100 yr/s = 100K×), freeze moon integration — their orbits
// would take thousands of laps per real second and destabilize the integrator.
const MOON_SKIP_THRESHOLD = 100  // yr/s

export function stepSimulation(state: SimState, acc: Vec2[], dtReal: number, pauseOnEvent: boolean): { newAcc: Vec2[]; fired: boolean } {
  if (state.paused) return { newAcc: acc, fired: false }

  const skipMoons = state.timeScale > MOON_SKIP_THRESHOLD
  const areMoonsPresent = state.bodies.some(b => b.isMoon && !b.ejected)

  // When moons are active, use a smaller max step to resolve their fast orbits.
  // Io's period is 1.769 days = 0.00484 yr; 0.0005 yr gives ≥9 steps/orbit.
  // At high speeds moons are frozen so we can use the coarser 0.004 yr step.
  const MAX_DT_STEP = (areMoonsPresent && !skipMoons) ? 0.0005 : 0.004

  const dtSim = state.timeScale * dtReal        // years of simulation this frame
  const steps = Math.max(80, Math.ceil(dtSim / MAX_DT_STEP))
  const dtStep = dtSim / steps

  let newAcc = acc
  let eventFired = false

  // Trail sampling interval: aim for ~200 samples per frame regardless of step count
  const trailInterval = Math.max(1, Math.floor(steps / 200))

  for (let s = 0; s < steps; s++) {
    newAcc = leapfrogStep(state.bodies, newAcc, dtStep, skipMoons)
    state.time += dtStep

    // Sample trail at reduced rate to keep buffer useful
    if (s % trailInterval === 0) {
      for (const b of state.bodies) {
        if (!b.ejected && !(skipMoons && b.isMoon)) pushTrail(b, b.pos.x, b.pos.y)
      }
    }

    // Check events every ~80 steps to avoid event-detection overhead at 4000 steps
    if (s % 80 === 0) {
      const fired = detectEvents(state.bodies, state.time)
      if (fired.length > 0) {
        state.events.unshift(...fired)
        if (state.events.length > EVENT_LOG_MAX) state.events.length = EVENT_LOG_MAX
        if (pauseOnEvent) {
          state.paused = true
          eventFired = true
          break
        }
      }
    }
  }

  // Remove fully ejected bodies from active N-body (keep for display briefly)
  // They are already flagged ejected; gravity.ts skips them.

  return { newAcc, fired: eventFired }
}

export function resetSimulation(state: SimState, initialBodies: Body[]): Vec2[] {
  const fresh = deepCloneBodies(initialBodies)
  fresh.forEach(initTrail)
  state.bodies = fresh
  state.time = 0
  state.events = []
  state.paused = false
  return computeAccelerations(fresh)
}

function initTrail(b: Body) {
  b.trail = new Array(TRAIL_CAPACITY).fill(null).map(() => ({ x: 0, y: 0 }))
  b.trailHead = 0
  b.trailLen = 0
}

function pushTrail(b: Body, x: number, y: number) {
  b.trail[b.trailHead] = { x, y }
  b.trailHead = (b.trailHead + 1) % TRAIL_CAPACITY
  if (b.trailLen < TRAIL_CAPACITY) b.trailLen++
}

function deepCloneBodies(bodies: Body[]): Body[] {
  return bodies.map(b => ({
    ...b,
    pos: { ...b.pos },
    vel: { ...b.vel },
    trail: [],
    trailHead: 0,
    trailLen: 0,
  }))
}
