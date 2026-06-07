export interface Camera {
  x: number         // world-space center of view (AU)
  y: number
  scale: number     // pixels per AU
}

export function worldToScreen(cam: Camera, wx: number, wy: number, w: number, h: number): [number, number] {
  const sx = (wx - cam.x) * cam.scale + w / 2
  const sy = -(wy - cam.y) * cam.scale + h / 2
  return [sx, sy]
}

export function screenToWorld(cam: Camera, sx: number, sy: number, w: number, h: number): [number, number] {
  const wx = (sx - w / 2) / cam.scale + cam.x
  const wy = -((sy - h / 2) / cam.scale) + cam.y
  return [wx, wy]
}

// Zoom toward a screen-space point
export function zoomCamera(cam: Camera, factor: number, pivotSx: number, pivotSy: number, w: number, h: number): Camera {
  const [pwx, pwy] = screenToWorld(cam, pivotSx, pivotSy, w, h)
  const newScale = Math.min(Math.max(cam.scale * factor, 2), 80000)
  const scaleFactor = newScale / cam.scale
  return {
    x: pwx + (cam.x - pwx) / scaleFactor,
    y: pwy + (cam.y - pwy) / scaleFactor,
    scale: newScale,
  }
}

export function fitCamera(bodies: { pos: { x: number; y: number }; ejected: boolean }[], w: number, h: number): Camera {
  const active = bodies.filter(b => !b.ejected)
  if (active.length === 0) return { x: 0, y: 0, scale: 20 }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const b of active) {
    if (Math.abs(b.pos.x) > 200 || Math.abs(b.pos.y) > 200) continue
    minX = Math.min(minX, b.pos.x)
    maxX = Math.max(maxX, b.pos.x)
    minY = Math.min(minY, b.pos.y)
    maxY = Math.max(maxY, b.pos.y)
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const rangeX = Math.max((maxX - minX) * 1.3, 10)
  // When bodies are nearly coplanar (initial state), drive vertical range from aspect ratio
  const naturalRangeY = (maxY - minY) * 1.3
  const rangeY = naturalRangeY > 1 ? naturalRangeY : rangeX * (h / w)
  const scale = Math.min(w / rangeX, h / rangeY, 80000)

  return { x: cx, y: cy, scale: Math.max(scale, 2) }
}
