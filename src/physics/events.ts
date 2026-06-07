import { Body, SimEvent } from './types'
import { G, EJECTION_DISTANCE_AU } from './constants'

// Track close-approach pairs to avoid repeat logs within same encounter
const activeEncounters = new Set<string>()

export function detectEvents(bodies: Body[], time: number): SimEvent[] {
  const events: SimEvent[] = []
  const toMerge: [number, number][] = []

  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (a.ejected) continue

    // Ejection check: distance from barycenter > threshold AND specific orbital energy > 0
    const dist = Math.sqrt(a.pos.x * a.pos.x + a.pos.y * a.pos.y)
    if (dist > EJECTION_DISTANCE_AU) {
      if (!a.ejected) {
        a.ejected = true
        events.push({ type: 'ejection', time, description: `${a.name} ejected from the system`, bodyIds: [a.id] })
      }
      continue
    }

    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (b.ejected) continue

      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const dist2 = dx * dx + dy * dy
      const collisionDist = a.radius + b.radius

      if (dist2 < collisionDist * collisionDist) {
        toMerge.push([i, j])
        continue
      }

      // Close approach (within 3× collision distance), log once per encounter
      const pairKey = `${a.id}-${b.id}`
      const closeThresh = 3 * collisionDist
      if (dist2 < closeThresh * closeThresh) {
        if (!activeEncounters.has(pairKey)) {
          activeEncounters.add(pairKey)
          events.push({
            type: 'close_approach',
            time,
            description: `Close approach: ${a.name} & ${b.name}`,
            bodyIds: [a.id, b.id],
          })
        }
      } else {
        activeEncounters.delete(pairKey)
      }
    }
  }

  // Process merges (largest index first to keep indices stable)
  const mergedIndices = new Set<number>()
  for (const [i, j] of toMerge) {
    if (mergedIndices.has(i) || mergedIndices.has(j)) continue
    mergedIndices.add(j)
    const a = bodies[i]
    const b = bodies[j]
    const totalMass = a.mass + b.mass
    // Conserve momentum
    a.vel.x = (a.mass * a.vel.x + b.mass * b.vel.x) / totalMass
    a.vel.y = (a.mass * a.vel.y + b.mass * b.vel.y) / totalMass
    // Conserve center of mass position
    a.pos.x = (a.mass * a.pos.x + b.mass * b.pos.x) / totalMass
    a.pos.y = (a.mass * a.pos.y + b.mass * b.pos.y) / totalMass
    a.mass = totalMass
    // Scale radius proportional to cube root of mass
    a.radius = Math.cbrt(totalMass / (4 / 3 * Math.PI)) * 0.005
    a.visualRadius = Math.max(a.visualRadius, b.visualRadius) * 1.2
    b.ejected = true
    events.push({
      type: 'collision',
      time,
      description: `${a.name} absorbed ${b.name}`,
      bodyIds: [a.id, b.id],
    })
  }

  return events
}

export function computeTotalEnergy(bodies: Body[]): number {
  let ke = 0
  let pe = 0
  const active = bodies.filter(b => !b.ejected)
  for (const b of active) {
    ke += 0.5 * b.mass * (b.vel.x * b.vel.x + b.vel.y * b.vel.y)
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const dx = active[j].pos.x - active[i].pos.x
      const dy = active[j].pos.y - active[i].pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      pe -= G * active[i].mass * active[j].mass / dist
    }
  }
  return ke + pe
}
