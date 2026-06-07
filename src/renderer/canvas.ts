import { Body } from '../physics/types'
import { Camera, worldToScreen } from './camera'
import { MOON_RENDER_THRESHOLD_AU_PX } from '../physics/constants'

const AU_PX_THRESHOLD = MOON_RENDER_THRESHOLD_AU_PX

// Deterministic starfield: seed-based positions generated once
const STARS: [number, number, number][] = (() => {
  const s: [number, number, number][] = []
  let seed = 42
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  for (let i = 0; i < 280; i++) s.push([rand(), rand(), rand() * 1.4 + 0.4])
  return s
})()

export interface RenderOptions {
  selectedId: string | null
  showVelocityArrows: boolean
  addingBody: boolean
  auPerPixel: number
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

  // Starfield (fixed to screen, not world)
  for (const [fx, fy, r] of STARS) {
    ctx.beginPath()
    ctx.arc(fx * w, fy * h, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${0.25 + r * 0.25})`
    ctx.fill()
  }

  const auPerPx = 1 / cam.scale

  // Draw trails first (behind bodies)
  for (const b of bodies) {
    if (b.ejected) continue
    if (b.id === 'moon' && auPerPx > AU_PX_THRESHOLD) continue
    drawTrail(ctx, b, cam, w, h)
  }

  // Draw bodies
  for (const b of bodies) {
    if (b.ejected) continue
    if (b.id === 'moon' && auPerPx > AU_PX_THRESHOLD) continue

    const [sx, sy] = worldToScreen(cam, b.pos.x, b.pos.y, w, h)
    const r = Math.max(b.visualRadius, 2)
    const isSelected = b.id === opts.selectedId

    // Glow for Sun and massive bodies
    if (b.isStarOrMassive) {
      const grd = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 3)
      grd.addColorStop(0, b.color + '40')
      grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(sx, sy, r * 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Saturn's rings (drawn behind body)
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
    ctx.fillStyle = b.color
    ctx.fill()

    // Selection ring
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(sx, sy, r + 5, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Label — skip tiny unlabelled bodies (not selected) to reduce clutter
    if (isSelected || r >= 3) {
      drawLabel(ctx, b.name, sx, sy + r + 14, isSelected)
    }

    // Velocity arrow for selected body
    if (isSelected && opts.showVelocityArrows) {
      drawVelocityArrow(ctx, b, cam, w, h)
    }
  }

  // Controls hint — bottom-right corner
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.textAlign = 'right'
  ctx.fillText('Scroll to zoom  ·  Drag to pan  ·  Double-click a planet to focus', w - 14, h - 12)
}

function drawTrail(ctx: CanvasRenderingContext2D, b: Body, cam: Camera, w: number, h: number) {
  if (b.trailLen < 2) return

  const cap = b.trail.length
  ctx.beginPath()
  let started = false

  for (let i = 0; i < b.trailLen; i++) {
    // Iterate from oldest to newest
    const idx = (b.trailHead - b.trailLen + i + cap) % cap
    const [sx, sy] = worldToScreen(cam, b.trail[idx].x, b.trail[idx].y, w, h)
    if (!started) {
      ctx.moveTo(sx, sy)
      started = true
    } else {
      ctx.lineTo(sx, sy)
    }
  }

  const alpha = 0.55
  ctx.strokeStyle = hexToRgba(b.color, alpha)
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawLabel(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, selected: boolean) {
  ctx.font = selected ? 'bold 11px Inter, system-ui, sans-serif' : '10px Inter, system-ui, sans-serif'
  ctx.fillStyle = selected ? 'rgba(255,255,255,0.95)' : 'rgba(200,200,200,0.7)'
  ctx.textAlign = 'center'
  ctx.fillText(name, x, y)
}

const ARROW_SCALE = 12 // pixels per AU/yr

export function drawVelocityArrow(ctx: CanvasRenderingContext2D, b: Body, cam: Camera, w: number, h: number) {
  const [sx, sy] = worldToScreen(cam, b.pos.x, b.pos.y, w, h)
  const speed = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y)
  if (speed < 1e-8) return

  const ex = sx + b.vel.x * ARROW_SCALE
  const ey = sy - b.vel.y * ARROW_SCALE

  ctx.strokeStyle = 'rgba(255, 220, 50, 0.9)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()

  // Arrow head
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
