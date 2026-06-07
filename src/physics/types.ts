export interface Vec2 {
  x: number
  y: number
}

export interface Body {
  id: string
  name: string
  mass: number        // solar masses
  pos: Vec2           // AU
  vel: Vec2           // AU/yr
  radius: number      // AU (collision radius, not visual)
  visualRadius: number // pixels at reference zoom
  color: string
  trail: Vec2[]       // ring buffer filled externally
  trailHead: number
  trailLen: number
  ejected: boolean
  isStarOrMassive: boolean
}

export interface SimEvent {
  type: 'collision' | 'ejection' | 'capture' | 'close_approach'
  time: number        // simulated years
  description: string
  bodyIds: string[]
}
