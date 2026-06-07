import { Body, Vec2 } from './types'
import { G, SOFTENING_SQ } from './constants'

// ─── Unit conversions ────────────────────────────────────────────────────────
const MKILLOMETER_PER_AU = 149.598       // 1 AU = 149.598 million km
const KMS_PER_AU_YR = 4.74047            // 1 AU/yr = 4.74047 km/s
const EARTH_MASS = 3.003e-6              // solar masses
const JUPITER_MASS = 9.548e-4            // solar masses

// ─── Orbital stats returned to the inspector ────────────────────────────────

export interface OrbitalStats {
  distAU: number
  distMkm: number
  speedKms: number
  massDisplay: string          // e.g. "1.00 Earth masses"
  periodDisplay: string        // e.g. "365 days" | "11.9 yrs" | "Unbound"
  periodYears: number | null
  hillSphereMkm: number | null // where moons can orbit stably
  escapeVelKms: number         // escape velocity from body surface
  eccentricity: number | null
  status: 'Stable' | 'Perturbed' | 'Escaping'
  statusColor: string
}

export function getOrbitalStats(body: Body, allBodies: Body[]): OrbitalStats {
  // Primary = most massive non-ejected body (usually the Sun)
  const primary = allBodies
    .filter(b => !b.ejected && b.id !== body.id)
    .reduce((best, b) => (b.mass > best.mass ? b : best), allBodies[0])

  // Relative position and velocity to primary
  const dx = body.pos.x - primary.pos.x
  const dy = body.pos.y - primary.pos.y
  const dvx = body.vel.x - primary.vel.x
  const dvy = body.vel.y - primary.vel.y

  const r = Math.sqrt(dx * dx + dy * dy)
  const v = Math.sqrt(dvx * dvx + dvy * dvy)

  // Specific orbital energy (per unit mass of the orbiting body)
  const E = 0.5 * v * v - G * primary.mass / r

  // Semi-major axis from energy (negative if bound)
  const a = E < 0 ? -G * primary.mass / (2 * E) : null

  // Orbital period: P (yr) = √(a³ / M_primary) generalised from Kepler (G=4π²)
  const periodYears = a !== null ? Math.sqrt((a * a * a) / primary.mass) : null

  // Specific angular momentum (2D cross product)
  const L = dx * dvy - dy * dvx

  // Eccentricity from orbital mechanics: e = √(1 + 2·E·L² / (G·M)²)
  const eccentricity =
    a !== null
      ? Math.sqrt(Math.max(0, 1 + (2 * E * L * L) / (G * G * primary.mass * primary.mass)))
      : null

  // Hill sphere radius (AU): r_H = a·(m/3M)^(1/3)
  const hillSphereAU =
    a !== null ? a * Math.cbrt(body.mass / (3 * primary.mass)) : null

  // Escape velocity from the body itself: v_esc = √(2GM/r_collision) in AU/yr
  const escapeVelKms =
    Math.sqrt(2 * G * body.mass / Math.max(body.radius, 1e-6)) * KMS_PER_AU_YR

  // Status
  let status: OrbitalStats['status'] = 'Stable'
  let statusColor = '#4ade80'
  if (E >= 0) {
    status = 'Escaping'
    statusColor = '#f87171'
  } else if (eccentricity !== null && eccentricity > 0.5) {
    status = 'Perturbed'
    statusColor = '#fbbf24'
  }

  // Mass display
  let massDisplay: string
  if (body.mass >= 0.1) {
    massDisplay = `${(body.mass).toFixed(2)} M☉`
  } else if (body.mass >= JUPITER_MASS * 0.1) {
    massDisplay = `${(body.mass / JUPITER_MASS).toFixed(2)} Jupiter masses`
  } else {
    massDisplay = `${(body.mass / EARTH_MASS).toFixed(2)} Earth masses`
  }

  // Period display
  let periodDisplay = 'Unbound'
  if (periodYears !== null) {
    if (periodYears < 1) {
      periodDisplay = `${Math.round(periodYears * 365)} days`
    } else if (periodYears < 1000) {
      periodDisplay = `${periodYears.toFixed(1)} yrs`
    } else {
      periodDisplay = `${(periodYears / 1000).toFixed(1)}K yrs`
    }
  }

  return {
    distAU: r,
    distMkm: r * MKILLOMETER_PER_AU,
    speedKms: v * KMS_PER_AU_YR,
    massDisplay,
    periodDisplay,
    periodYears,
    hillSphereMkm: hillSphereAU !== null ? hillSphereAU * MKILLOMETER_PER_AU : null,
    escapeVelKms,
    eccentricity,
    status,
    statusColor,
  }
}

// ─── Predicted orbit ──────────────────────────────────────────────────────────

export function computePredictedOrbit(
  body: Body,
  allBodies: Body[],
): Vec2[] {
  // Choose dt: small enough to resolve orbit, capped for performance
  const primary = allBodies
    .filter(b => !b.ejected && b.id !== body.id)
    .reduce((best, b) => (b.mass > best.mass ? b : best), allBodies[0])

  const dx = body.pos.x - primary.pos.x
  const dy = body.pos.y - primary.pos.y
  const r = Math.sqrt(dx * dx + dy * dy)
  const v2 = body.vel.x ** 2 + body.vel.y ** 2
  const E = 0.5 * v2 - G * primary.mass / r
  const a = E < 0 ? -G * primary.mass / (2 * E) : null
  const period = a !== null ? Math.sqrt((a * a * a) / primary.mass) : null

  const dt = period !== null
    ? Math.min(Math.max(period / 60, 0.003), 0.15)  // 60 steps per orbit, bounded
    : 0.04

  const steps = period !== null ? Math.min(Math.ceil(period / dt) + 5, 500) : 300

  // Simulate forward with other bodies FIXED at their current positions
  let px = body.pos.x, py = body.pos.y
  let vx = body.vel.x, vy = body.vel.y

  const points: Vec2[] = [{ x: px, y: py }]
  const others = allBodies.filter(b => !b.ejected && b.id !== body.id)

  const accel = (x: number, y: number): [number, number] => {
    let ax = 0, ay = 0
    for (const o of others) {
      const ddx = o.pos.x - x
      const ddy = o.pos.y - y
      const distSq = ddx * ddx + ddy * ddy + SOFTENING_SQ
      const dist = Math.sqrt(distSq)
      const f = G * o.mass / (distSq * dist)
      ax += f * ddx
      ay += f * ddy
    }
    return [ax, ay]
  }

  let [ax, ay] = accel(px, py)

  for (let i = 0; i < steps; i++) {
    // Leapfrog
    vx += ax * dt / 2
    vy += ay * dt / 2
    px += vx * dt
    py += vy * dt;
    [ax, ay] = accel(px, py)
    vx += ax * dt / 2
    vy += ay * dt / 2

    points.push({ x: px, y: py })
    if (px * px + py * py > 200 * 200) break  // escaped
  }

  return points
}

// ─── Circular orbit velocity ──────────────────────────────────────────────────

/** Returns the velocity vector for a circular orbit around the primary at the body's current position. */
export function circularOrbitVelocity(body: Body, allBodies: Body[]): Vec2 {
  const primary = allBodies
    .filter(b => !b.ejected && b.id !== body.id)
    .reduce((best, b) => (b.mass > best.mass ? b : best), allBodies[0])

  const dx = body.pos.x - primary.pos.x
  const dy = body.pos.y - primary.pos.y
  const r = Math.sqrt(dx * dx + dy * dy)
  const speed = Math.sqrt(G * primary.mass / r)  // AU/yr

  // Tangent direction (counter-clockwise): (-dy/r, dx/r)
  return {
    x: primary.vel.x + (-dy / r) * speed,
    y: primary.vel.y + (dx / r) * speed,
  }
}
