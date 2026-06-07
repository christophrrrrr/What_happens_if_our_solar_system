import { Body } from './types'
import { computeAccelerations } from './gravity'

// Leapfrog (Störmer-Verlet) — symplectic, energy-conserving over long runs.
// Requires acc to be pre-computed at the current position before the first call.
// After each call, acc is stored on the simulation for the next call.
export function leapfrogStep(bodies: Body[], prevAcc: { x: number; y: number }[], dt: number): { x: number; y: number }[] {
  const n = bodies.length

  // Half-kick velocities
  for (let i = 0; i < n; i++) {
    if (bodies[i].ejected) continue
    bodies[i].vel.x += prevAcc[i].x * (dt / 2)
    bodies[i].vel.y += prevAcc[i].y * (dt / 2)
  }

  // Full drift positions
  for (let i = 0; i < n; i++) {
    if (bodies[i].ejected) continue
    bodies[i].pos.x += bodies[i].vel.x * dt
    bodies[i].pos.y += bodies[i].vel.y * dt
  }

  // Recompute accelerations at new positions
  const newAcc = computeAccelerations(bodies)

  // Half-kick velocities with new acc
  for (let i = 0; i < n; i++) {
    if (bodies[i].ejected) continue
    bodies[i].vel.x += newAcc[i].x * (dt / 2)
    bodies[i].vel.y += newAcc[i].y * (dt / 2)
  }

  return newAcc
}
