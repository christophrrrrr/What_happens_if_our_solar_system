import { Body, Explosion } from '../physics/types'
import { Camera, worldToScreen } from './camera'
import { MOON_RENDER_THRESHOLD_AU_PX } from '../physics/constants'
import type { Vec2 } from '../physics/types'

// Deterministic starfield: seed-based positions generated once
const STARS: [number, number, number][] = (() => {
  const s: [number, number, number][] = []
  let seed = 42
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  for (let i = 0; i < 280; i++) s.push([rand(), rand(), rand() * 1.4 + 0.4])
  return s
})()

// Module-level gravity field canvas cache to avoid re-allocating each frame
let _gravOffscreen: OffscreenCanvas | null = null
let _gravOffCtx: OffscreenCanvasRenderingContext2D | null = null
let _gravCols = 0
let _gravRows = 0

export interface RenderOptions {
  selectedId: string | null
  showVelocityArrows: boolean
  addingBody: boolean
  auPerPixel: number
  predictedOrbit: Vec2[] | null
  selectedColor: string
  explosions: Explosion[]
  nowMs: number
  showGravityField: boolean
  // Ghost body during add-drag
  ghostWorldPos: { x: number; y: number } | null
  ghostScreenDrag: { x: number; y: number } | null // current mouse screen pos
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  bodies: Body[],
  cam: Camera,
  opts: RenderOptions,
) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height

  // Background
  ctx.fillStyle = '#030712'
  ctx.fillRect(0, 0, w, h)

  // Gravity field heatmap (drawn before starfield so stars show through)
  if (opts.showGravityField) {
    drawGravityField(ctx, bodies, cam, w, h)
  }

  // Starfield (fixed to screen, not world)
  for (const [fx, fy, r] of STARS) {
    ctx.beginPath()
    ctx.arc(fx * w, fy * h, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${0.25 + r * 0.25})`
    ctx.fill()
  }

  const auPerPx = 1 / cam.scale

  // Draw predicted orbit FIRST (behind everything)
  if (opts.predictedOrbit && opts.predictedOrbit.length > 1) {
    drawPredictedOrbit(ctx, opts.predictedOrbit, cam, w, h, opts.selectedColor)
  }

  // Draw trails (behind bodies); moons only when zoomed in enough
  for (const b of bodies) {
    if (b.ejected) continue
    if (b.isMoon && auPerPx > MOON_RENDER_THRESHOLD_AU_PX) continue
    drawTrail(ctx, b, cam, w, h)
  }

  // Draw bodies
  for (const b of bodies) {
    if (b.ejected) continue
    if (b.isMoon && auPerPx > MOON_RENDER_THRESHOLD_AU_PX) continue
    drawBody(ctx, b, cam, w, h, opts.selectedId, opts.showVelocityArrows)
  }

  // Draw ghost body (add-body drag preview)
  if (opts.ghostWorldPos) {
    const [gx, gy] = worldToScreen(cam, opts.ghostWorldPos.x, opts.ghostWorldPos.y, w, h)
    // Ghost circle
    ctx.beginPath()
    ctx.arc(gx, gy, 8, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(100,180,255,0.25)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(100,180,255,0.8)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Velocity arrow to mouse
    if (opts.ghostScreenDrag) {
      const mx = opts.ghostScreenDrag.x
      const my = opts.ghostScreenDrag.y
      ctx.strokeStyle = 'rgba(255,220,50,0.85)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(gx, gy)
      ctx.lineTo(mx, my)
      ctx.stroke()
      const angle = Math.atan2(my - gy, mx - gx)
      const head = 10
      ctx.beginPath()
      ctx.moveTo(mx, my)
      ctx.lineTo(mx - head * Math.cos(angle - 0.45), my - head * Math.sin(angle - 0.45))
      ctx.moveTo(mx, my)
      ctx.lineTo(mx - head * Math.cos(angle + 0.45), my - head * Math.sin(angle + 0.45))
      ctx.stroke()

      // Speed label
      const dx = (mx - gx), dy = (my - gy)
      const speedAuYr = Math.sqrt(dx * dx + dy * dy) / 12
      const speedKms = speedAuYr * 4.74047
      ctx.font = '10px Inter, system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,220,50,0.9)'
      ctx.textAlign = 'center'
      ctx.fillText(`${speedKms.toFixed(1)} km/s`, (gx + mx) / 2, (gy + my) / 2 - 8)
    }
  }

  // Draw explosions
  drawExplosions(ctx, opts.explosions, cam, w, h, opts.nowMs)

  // Controls hint
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.textAlign = 'right'
  ctx.setLineDash([])
  ctx.fillText('Click any planet to edit  ·  Scroll to zoom  ·  Drag to pan  ·  Double-click to focus', w - 14, h - 12)
}

// ─── Gravity field heatmap ────────────────────────────────────────────────────
// Renders a blue→cyan→orange→red→white glow proportional to log(gravity).
// Uses a downsampled grid (every GRID pixels) drawn onto an OffscreenCanvas
// then scaled up to avoid O(w*h) pixel writes.

const G_VAL = 4 * Math.PI * Math.PI  // G in AU/M☉/yr units
const G_REF = 0.1                     // Reference acceleration — 0.1 AU/yr² ≈ 1/400 Earth orbital

function gravColor(t: number): [number, number, number, number] {
  // Ramp: 0=transparent space, 0.3=blue, 0.55=cyan, 0.75=orange, 0.9=red, 1.0=white-hot
  if (t <= 0) return [0, 0, 0, 0]
  if (t < 0.3) {
    const s = t / 0.3
    return [0, Math.round(20 * s), Math.round(120 * s), Math.round(80 * s)]
  }
  if (t < 0.55) {
    const s = (t - 0.3) / 0.25
    return [0, Math.round(20 + 100 * s), Math.round(120 - 40 * s), Math.round(80 + 60 * s)]
  }
  if (t < 0.75) {
    const s = (t - 0.55) / 0.2
    return [Math.round(200 * s), Math.round(120 - 80 * s), 0, Math.round(140 + 20 * s)]
  }
  if (t < 0.9) {
    const s = (t - 0.75) / 0.15
    return [Math.round(200 + 55 * s), Math.round(40 - 40 * s), 0, Math.round(160 + 20 * s)]
  }
  const s = Math.min(1, (t - 0.9) / 0.1)
  return [255, Math.round(60 + 180 * s), Math.round(180 * s), Math.round(180 + 20 * s)]
}

function drawGravityField(
  ctx: CanvasRenderingContext2D,
  bodies: Body[],
  cam: Camera,
  w: number,
  h: number,
) {
  const GRID = 8
  const cols = Math.ceil(w / GRID)
  const rows = Math.ceil(h / GRID)

  // Reuse OffscreenCanvas if size unchanged
  if (!_gravOffscreen || _gravCols !== cols || _gravRows !== rows) {
    _gravOffscreen = new OffscreenCanvas(cols, rows)
    _gravOffCtx = _gravOffscreen.getContext('2d')!
    _gravCols = cols
    _gravRows = rows
  }

  const activeBodies = bodies.filter(b => !b.ejected)
  const imgData = _gravOffCtx!.createImageData(cols, rows)
  const px = imgData.data

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Center of this grid cell in screen coords → world coords
      const sx = col * GRID + GRID / 2
      const sy = row * GRID + GRID / 2
      const wx = cam.x + (sx - w / 2) / cam.scale
      const wy = cam.y - (sy - h / 2) / cam.scale

      // Sum gravitational acceleration magnitude from all bodies
      let gTotal = 0
      for (const b of activeBodies) {
        const dx = b.pos.x - wx
        const dy = b.pos.y - wy
        const distSq = dx * dx + dy * dy + 1e-8
        gTotal += G_VAL * b.mass / distSq
      }

      // Log-normalize to [0,1] over 3 decades above G_REF
      const t = Math.min(1, Math.log10(1 + gTotal / G_REF) / 3)
      const [r, g, b, a] = gravColor(t)

      const i = (row * cols + col) * 4
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a
    }
  }

  _gravOffCtx!.putImageData(imgData, 0, 0)

  // Scale up to canvas size with bilinear smoothing
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(_gravOffscreen, 0, 0, w, h)
  ctx.restore()
}

// ─── Draw a single body ───────────────────────────────────────────────────────

function drawBody(
  ctx: CanvasRenderingContext2D,
  b: Body,
  cam: Camera,
  w: number,
  h: number,
  selectedId: string | null,
  showArrows: boolean,
) {
  const [sx, sy] = worldToScreen(cam, b.pos.x, b.pos.y, w, h)
  const r = Math.max(b.visualRadius, 2)
  const isSelected = b.id === selectedId
  const isBlackHole = b.bodyType === 'black_hole'

  // Black hole: accretion disk behind body
  if (isBlackHole) {
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(0.3)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 2.4, r * 0.65, 0, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,140,20,0.65)'
    ctx.lineWidth = r * 1.1
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 1.35, r * 0.36, 0, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,220,120,0.35)'
    ctx.lineWidth = r * 0.5
    ctx.stroke()
    ctx.restore()
  }

  // Glow for Sun and massive bodies (not black holes)
  if (b.isStarOrMassive && !isBlackHole) {
    const grd = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 3)
    grd.addColorStop(0, b.color + '40')
    grd.addColorStop(1, 'transparent')
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(sx, sy, r * 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Saturn's rings
  if (b.id === 'saturn') {
    ctx.beginPath()
    ctx.ellipse(sx, sy, r * 2.4, r * 0.7, 0.3, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(200,185,120,0.55)'
    ctx.lineWidth = r * 0.9
    ctx.stroke()
  }

  // Body circle
  ctx.beginPath()
  ctx.arc(sx, sy, r, 0, Math.PI * 2)
  ctx.fillStyle = isBlackHole ? '#050505' : b.color
  ctx.fill()

  // Selection ring
  if (isSelected) {
    ctx.beginPath()
    ctx.arc(sx, sy, r + 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.stroke()
  }

  // Label
  if (isSelected || r >= 3) {
    drawLabel(ctx, b.name, sx, sy + r + 14, isSelected)
  }

  // Velocity arrow
  if (isSelected && showArrows) {
    drawVelocityArrow(ctx, b, cam, w, h)
  }
}

// ─── Trail ────────────────────────────────────────────────────────────────────

function drawTrail(ctx: CanvasRenderingContext2D, b: Body, cam: Camera, w: number, h: number) {
  if (b.trailLen < 2) return
  const cap = b.trail.length
  ctx.beginPath()
  let started = false
  for (let i = 0; i < b.trailLen; i++) {
    const idx = (b.trailHead - b.trailLen + i + cap) % cap
    const [sx, sy] = worldToScreen(cam, b.trail[idx].x, b.trail[idx].y, w, h)
    if (!started) { ctx.moveTo(sx, sy); started = true } else ctx.lineTo(sx, sy)
  }
  ctx.strokeStyle = hexToRgba(b.color === '#111111' ? '#555555' : b.color, 0.45)
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.stroke()
}

// ─── Predicted orbit ghost ────────────────────────────────────────────────────

function drawPredictedOrbit(ctx: CanvasRenderingContext2D, points: Vec2[], cam: Camera, w: number, h: number, color: string) {
  if (points.length < 2) return
  ctx.beginPath()
  let started = false
  for (const p of points) {
    const [sx, sy] = worldToScreen(cam, p.x, p.y, w, h)
    if (!started) { ctx.moveTo(sx, sy); started = true } else ctx.lineTo(sx, sy)
  }
  ctx.strokeStyle = hexToRgba(color, 0.28)
  ctx.lineWidth = 1.2
  ctx.setLineDash([7, 7])
  ctx.stroke()
  ctx.setLineDash([])
}

// ─── Explosions ───────────────────────────────────────────────────────────────

function drawExplosions(ctx: CanvasRenderingContext2D, explosions: Explosion[], cam: Camera, w: number, h: number, nowMs: number) {
  for (const ex of explosions) {
    const t = (nowMs - ex.startMs) / ex.durationMs
    if (t >= 1 || t < 0) continue
    const [sx, sy] = worldToScreen(cam, ex.worldX, ex.worldY, w, h)
    const ease = 1 - (1 - t) * (1 - t) // ease-out

    // Bright core flash (early only)
    if (t < 0.15) {
      const flashAlpha = (0.15 - t) / 0.15 * 0.9
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40)
      grd.addColorStop(0, `rgba(255,255,255,${flashAlpha})`)
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(sx, sy, 40, 0, Math.PI * 2)
      ctx.fill()
    }

    // Outer ring
    ctx.beginPath()
    ctx.arc(sx, sy, ease * 90, 0, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(ex.color, (1 - t) * 0.75)
    ctx.lineWidth = Math.max(1, 5 * (1 - t))
    ctx.setLineDash([])
    ctx.stroke()

    // Inner ring (faster)
    const t2 = Math.min(1, t * 1.8)
    ctx.beginPath()
    ctx.arc(sx, sy, t2 * 45, 0, Math.PI * 2)
    ctx.strokeStyle = hexToRgba('#ffffff', (1 - t2) * 0.45)
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function drawLabel(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, selected: boolean) {
  ctx.font = selected ? 'bold 11px Inter, system-ui, sans-serif' : '10px Inter, system-ui, sans-serif'
  ctx.fillStyle = selected ? 'rgba(255,255,255,0.95)' : 'rgba(200,200,200,0.7)'
  ctx.textAlign = 'center'
  ctx.setLineDash([])
  ctx.fillText(name, x, y)
}

export const ARROW_SCALE = 12 // pixels per AU/yr

export function drawVelocityArrow(ctx: CanvasRenderingContext2D, b: Body, cam: Camera, w: number, h: number) {
  const [sx, sy] = worldToScreen(cam, b.pos.x, b.pos.y, w, h)
  const speed = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y)
  if (speed < 1e-8) return
  const ex = sx + b.vel.x * ARROW_SCALE
  const ey = sy - b.vel.y * ARROW_SCALE
  ctx.strokeStyle = 'rgba(255,220,50,0.9)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  const angle = Math.atan2(sy - ey, ex - sx)
  const headLen = 8
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - headLen * Math.cos(angle - 0.5), ey + headLen * Math.sin(angle - 0.5))
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - headLen * Math.cos(angle + 0.5), ey + headLen * Math.sin(angle + 0.5))
  ctx.stroke()
}

export function getVelocityArrowTip(b: Body, cam: Camera, w: number, h: number): [number, number] {
  const [sx, sy] = worldToScreen(cam, b.pos.x, b.pos.y, w, h)
  return [sx + b.vel.x * ARROW_SCALE, sy - b.vel.y * ARROW_SCALE]
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
