// In AU / solar-mass / year units, G = 4π²
export const G = 4 * Math.PI * Math.PI

// Softening length squared (AU²) — prevents force singularity on close approach
export const SOFTENING_SQ = 1e-6

// Trail ring buffer capacity per body
export const TRAIL_CAPACITY = 1200

// AU at which an unbound body is removed from simulation
export const EJECTION_DISTANCE_AU = 600

// Zoom threshold (AU per canvas pixel) below which moons are rendered
export const MOON_RENDER_THRESHOLD_AU_PX = 0.005
