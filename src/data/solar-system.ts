import { Body, BodyPresetKey } from '../physics/types'

// ─── Body presets for the "Add body" type picker ─────────────────────────────

export type { BodyPresetKey }

export const BODY_PRESETS: Record<BodyPresetKey, Omit<Body, 'id' | 'pos' | 'vel' | 'trail' | 'trailHead' | 'trailLen' | 'ejected'>> = {
  planet: {
    name: 'Planet', mass: 3e-6, visualRadius: 7, color: '#7ec8e3',
    radius: 0.0003, isStarOrMassive: false, bodyType: 'planet',
  },
  gas_giant: {
    name: 'Gas Giant', mass: 1e-3, visualRadius: 13, color: '#c88b3a',
    radius: 0.002, isStarOrMassive: true, bodyType: 'gas_giant',
  },
  star: {
    name: 'Star', mass: 1.0, visualRadius: 18, color: '#FDB813',
    radius: 0.005, isStarOrMassive: true, bodyType: 'star',
  },
  black_hole: {
    name: 'Black Hole', mass: 10, visualRadius: 14, color: '#111111',
    radius: 0.006, isStarOrMassive: true, bodyType: 'black_hole',
  },
  comet: {
    name: 'Comet', mass: 1e-10, visualRadius: 3, color: '#aaffee',
    radius: 0.00002, isStarOrMassive: false, bodyType: 'comet',
  },
}

export function makeBodyFromPreset(
  preset: BodyPresetKey,
  id: string,
  pos: { x: number; y: number },
  vel: { x: number; y: number },
): Body {
  return {
    ...BODY_PRESETS[preset],
    id,
    pos: { ...pos },
    vel: { ...vel },
    trail: [],
    trailHead: 0,
    trailLen: 0,
    ejected: false,
  }
}

// Units: AU (position), AU/yr (velocity), solar masses (mass)
// G = 4π² in these units. Epoch: J2000.0
// Orbital velocities computed as v = sqrt(G·M_sun / a) for near-circular orbits.
// Inclinations ignored (2D ecliptic plane projection).

// Circular orbit speed around the Sun (AU/yr): v = 2π/√a (since G·M☉ = 4π²)
function circularSpeed(a: number): number {
  return (2 * Math.PI) / Math.sqrt(a)
}

// Place body at semi-major axis `a` AU, at ecliptic longitude `deg` degrees (J2000 approx)
// Returns position and velocity for a prograde circular orbit
function orbit(a: number, deg: number): { pos: { x: number; y: number }; vel: { x: number; y: number } } {
  const θ = (deg * Math.PI) / 180
  const v = circularSpeed(a)
  return {
    pos: { x: a * Math.cos(θ), y: a * Math.sin(θ) },
    // Tangent to circle (counter-clockwise): (-sin θ, cos θ) × speed
    vel: { x: -v * Math.sin(θ), y: v * Math.cos(θ) },
  }
}

export function makeSolarSystemBodies(): Body[] {
  const bodies: Body[] = [
    {
      id: 'sun',
      name: 'Sun',
      mass: 1.0,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.005,
      visualRadius: 18,
      color: '#FDB813',
      isStarOrMassive: true,
      ejected: false,
      trail: [], trailHead: 0, trailLen: 0,
    },
    // Approximate J2000.0 mean ecliptic longitudes for each planet
    { id: 'mercury', name: 'Mercury', mass: 1.652e-7, ...orbit(0.387, 252),
      radius: 0.0001, visualRadius: 4, color: '#b5b5b5', isStarOrMassive: false,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
    { id: 'venus', name: 'Venus', mass: 2.447e-6, ...orbit(0.723, 182),
      radius: 0.0003, visualRadius: 6, color: '#e8cda0', isStarOrMassive: false,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
    { id: 'earth', name: 'Earth', mass: 3.003e-6, ...orbit(1.0, 100),
      radius: 0.0003, visualRadius: 7, color: '#4fa3e0', isStarOrMassive: false,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
    (() => {
      // Moon orbits Earth; place it perpendicular to Earth's velocity
      const earth = orbit(1.0, 100)
      const moonDist = 0.00257
      // Perpendicular to Earth's position vector = radial offset + Moon orbital vel
      const θ = (100 * Math.PI) / 180
      const moonOrbSpeed = 0.2154
      return {
        id: 'moon', name: 'Moon', mass: 3.694e-8,
        pos: { x: earth.pos.x + moonDist * Math.cos(θ + Math.PI / 2), y: earth.pos.y + moonDist * Math.sin(θ + Math.PI / 2) },
        vel: { x: earth.vel.x + moonOrbSpeed * Math.cos(θ + Math.PI), y: earth.vel.y + moonOrbSpeed * Math.sin(θ + Math.PI) },
        radius: 0.00004, visualRadius: 3, color: '#cccccc', isStarOrMassive: false,
        ejected: false, trail: [] as { x: number; y: number }[], trailHead: 0, trailLen: 0,
      }
    })(),
    { id: 'mars', name: 'Mars', mass: 3.213e-7, ...orbit(1.524, 355),
      radius: 0.0002, visualRadius: 5, color: '#c1440e', isStarOrMassive: false,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
    { id: 'jupiter', name: 'Jupiter', mass: 9.548e-4, ...orbit(5.203, 34),
      radius: 0.002, visualRadius: 14, color: '#c88b3a', isStarOrMassive: true,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
    {
      id: 'saturn',
      name: 'Saturn',
      mass: 2.859e-4,
      ...orbit(9.537, 50),
      radius: 0.0015,
      visualRadius: 12,
      color: '#e4d191',
      isStarOrMassive: true,
      ejected: false,
      trail: [], trailHead: 0, trailLen: 0,
    },
    { id: 'uranus', name: 'Uranus', mass: 4.365e-5, ...orbit(19.19, 314),
      radius: 0.0008, visualRadius: 9, color: '#7de8e8', isStarOrMassive: false,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
    { id: 'neptune', name: 'Neptune', mass: 5.149e-5, ...orbit(30.07, 304),
      radius: 0.0008, visualRadius: 9, color: '#5b86e5', isStarOrMassive: false,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
    { id: 'pluto', name: 'Pluto', mass: 6.581e-9, ...orbit(39.48, 238),
      radius: 0.00005, visualRadius: 3, color: '#a08060', isStarOrMassive: false,
      ejected: false, trail: [], trailHead: 0, trailLen: 0 },
  ]

  return bodies
}

export type ScenarioId = 'default' | 'no-jupiter' | 'double-sun' | 'earth-at-mars' | 'rogue-planet' | 'sun-blackhole' | 'binary-star' | 'heavy-earth'

export function makeScenario(id: ScenarioId): Body[] {
  const base = makeSolarSystemBodies()

  switch (id) {
    case 'no-jupiter':
      return base.filter(b => b.id !== 'jupiter')

    case 'double-sun': {
      const s = base.find(b => b.id === 'sun')!
      s.mass *= 2
      s.visualRadius = 26
      return base
    }

    case 'earth-at-mars': {
      const earth = base.find(b => b.id === 'earth')!
      const moon = base.find(b => b.id === 'moon')!
      const a = 1.524
      const deg = 100 // keep same longitude as Earth default
      const o = orbit(a, deg)
      earth.pos = o.pos
      earth.vel = o.vel
      const θ = (deg * Math.PI) / 180
      moon.pos = { x: o.pos.x + 0.00257 * Math.cos(θ + Math.PI / 2), y: o.pos.y + 0.00257 * Math.sin(θ + Math.PI / 2) }
      moon.vel = { x: o.vel.x + 0.2154 * Math.cos(θ + Math.PI), y: o.vel.y + 0.2154 * Math.sin(θ + Math.PI) }
      return base
    }

    case 'rogue-planet': {
      const rogue: Body = {
        id: 'rogue',
        name: 'Rogue Planet',
        mass: 3e-3,
        pos: { x: -22, y: 3 },     // arrives in ~2.5 years at 8 AU/yr
        vel: { x: 8, y: -0.4 },
        radius: 0.003,
        visualRadius: 13,
        color: '#8b0000',
        isStarOrMassive: true,
        ejected: false,
        trail: [], trailHead: 0, trailLen: 0,
      }
      return [...base, rogue]
    }

    case 'sun-blackhole': {
      // Same mass as the Sun — planets keep orbiting exactly as before.
      // Great "aha" moment: a black hole doesn't suck things in, gravity is unchanged.
      const sun = base.find(b => b.id === 'sun')!
      sun.color = '#111111'
      sun.visualRadius = 14
      sun.bodyType = 'black_hole'
      sun.isStarOrMassive = true
      return base
    }

    case 'binary-star': {
      // Add a second star at ~8 AU in a roughly stable orbit.
      // Over centuries, watch planet orbits go chaotic.
      const o = orbit(8, 270)
      const star2: Body = {
        id: 'star2', name: 'Star B', mass: 0.8,
        ...o,
        radius: 0.005, visualRadius: 16, color: '#ff9966',
        isStarOrMassive: true, bodyType: 'star',
        ejected: false, trail: [], trailHead: 0, trailLen: 0,
      }
      // Boost the Sun's velocity to conserve momentum of the two-star barycenter
      const sun = base.find(b => b.id === 'sun')!
      sun.vel.x -= (0.8 * star2.vel.x) / 1.8
      sun.vel.y -= (0.8 * star2.vel.y) / 1.8
      return [...base, star2]
    }

    case 'heavy-earth': {
      // Give Earth 317× its mass (= Jupiter mass) — Moon likely escapes,
      // Venus and Mars orbits become perturbed.
      const earth = base.find(b => b.id === 'earth')!
      earth.mass = 9.548e-4  // Jupiter mass
      earth.visualRadius = 14
      earth.isStarOrMassive = true
      return base
    }

    default:
      return base
  }
}
