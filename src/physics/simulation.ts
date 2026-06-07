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

// Steps per render frame — high enough for stability at each timeScale
const STEPS_PER_FRAME = 80

export function stepSimulation(state: SimState, acc: Vec2[], dtReal: number, pauseOnEvent: boolean): { newAcc: Vec2[]; fired: boolean } {
  if (state.paused) return { newAcc: acc, fired: false }

  const dtSim = state.timeScale * dtReal        // years of simulation per real second
  const dtStep = dtSim / STEPS_PER_FRAME         // years per sub-step

  let newAcc = acc
  let eventFired = false

  for (let s = 0; s < STEPS_PER_FRAME; s++) {
    newAcc = leapfrogStep(state.bodies, newAcc, dtStep)
    state.time += dtStep

    // Sample trail every few steps to keep resolution reasonable
    if (s % 4 === 0) {
      for (const b of state.bodies) {
        if (!b.ejected) pushTrail(b, b.pos.x, b.pos.y)
      }
    }

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
