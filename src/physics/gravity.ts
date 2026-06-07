import { Body, Vec2 } from './types'
import { G, SOFTENING_SQ } from './constants'

export function computeAccelerations(bodies: Body[], skipMoons = false): Vec2[] {
  const n = bodies.length
  const acc: Vec2[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }))

  for (let i = 0; i < n; i++) {
    if (bodies[i].ejected) continue
    if (skipMoons && bodies[i].isMoon) continue
    for (let j = i + 1; j < n; j++) {
      if (bodies[j].ejected) continue
      if (skipMoons && bodies[j].isMoon) continue
      const dx = bodies[j].pos.x - bodies[i].pos.x
      const dy = bodies[j].pos.y - bodies[i].pos.y
      const distSq = dx * dx + dy * dy + SOFTENING_SQ
      const dist = Math.sqrt(distSq)
      const force = G / (distSq * dist)
      const fx = force * dx
      const fy = force * dy
      acc[i].x += bodies[j].mass * fx
      acc[i].y += bodies[j].mass * fy
      acc[j].x -= bodies[i].mass * fx
      acc[j].y -= bodies[i].mass * fy
    }
  }

  return acc
}
