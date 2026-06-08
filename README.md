# What Happens If…? — Solar System Simulator

An interactive N-body solar system simulator that lets you run "what if?" scenarios directly in the browser — no install, no backend, just physics.

**[Try it live →](whathappensifoursolarsystem.netlify.app)**

---

## What you can do

**Load a scenario** — start from a curated what-if and watch the chaos unfold:

| Scenario | Question it answers |
|---|---|
| **Rogue Planet** | What if a Jupiter-mass intruder passed through? |
| **No Jupiter** | Would the inner planets be bombarded without the gravitational shield? |
| **Binary Star** | Would Earth survive a second sun at 8 AU? |
| **Sun → Black Hole** | Would the planets fly off or keep orbiting? (Spoiler: they keep orbiting.) |
| **Double-Mass Sun** | What if the Sun gained mass overnight? |
| **Earth at Mars** | Is Mars's orbit actually habitable? |
| **Heavy Earth** | What if Earth were as massive as Jupiter? |

**Build your own system** — click the canvas to drop any body type (planet, gas giant, star, black hole, comet), drag to set its velocity vector, then watch it interact with everything else in real time.

**Inspect and tweak any body** — click any planet to open its inspector panel: live orbital elements (semi-major axis, period, eccentricity), a mass slider to make it heavier/lighter while the sim runs, and velocity nudge controls. Press **Delete** to remove it.

**Watch events** — collisions, ejections, gravitational captures, and close approaches are detected and logged. Enable *pause-on-event* to freeze the sim the moment something interesting happens.

---

## Physics

The simulation runs a full N-body gravitational model — every body pulls on every other body every step. There are no analytic approximations or Keplerian shortcuts.

**Integrator:** Leapfrog (Störmer-Verlet), a symplectic method that conserves energy over arbitrarily long runs without the secular drift that makes simpler Euler integration blow up.

**Units:** Astronomical Units, solar masses, and years. This gives G = 4π², keeping all values near 1.0 and eliminating unit conversion errors entirely.

**Close approach:** A softening parameter ε² prevents the force from becoming singular when bodies pass very close, matching standard practice in computational astrophysics.

**Moons:** All 11 real moons (Galilean moons, Titan, Rhea, Uranus's four major moons, Triton) are simulated with correct masses and orbital radii. At high time scales their integration is frozen to preserve integrator stability — the body remains in place rather than accumulating error.

**Initial conditions:** J2000.0 mean ecliptic longitudes and semi-major axes for all 8 planets + Pluto. Circular-orbit velocities computed from v = 2π/√a (exact for G = 4π², M☉ = 1).

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Type-safe physics vectors; catches unit-mismatch bugs at compile time |
| Framework | React 18 | UI state only — the physics loop runs outside React in a `useRef` |
| Renderer | Canvas 2D | Direct pixel control; no WebGL overhead needed at N < 50 bodies |
| Build | Vite | Sub-second HMR during development |
| Styling | Tailwind CSS | Utility-first, no context switching |

The physics loop is completely decoupled from React's render cycle. The simulation state lives in a `useRef` and is advanced on every `requestAnimationFrame` tick; React only re-renders when UI state (selected body, time scale, paused flag) changes.

---

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

```bash
npm run build   # production bundle
npm run preview # preview the build locally
```

---

## Project structure

```
src/
  physics/
    integrator.ts   # Leapfrog (Störmer-Verlet) — the core loop
    gravity.ts      # O(N²) pairwise force computation
    simulation.ts   # Step orchestration, trail sampling, event dispatch
    events.ts       # Collision / ejection / capture detection
    orbital.ts      # Orbital element extraction (a, e, T) from state vectors
    types.ts        # Body, SimEvent, Vec2 interfaces
    constants.ts    # G, softening, trail capacity, zoom thresholds
  data/
    solar-system.ts # Initial conditions + all 7 "what if?" scenarios
  renderer/
    canvas.ts       # Canvas drawing: bodies, trails, gravity heatmap, arrows
    camera.ts       # Pan / zoom coordinate transforms
  hooks/
    useSimulation.ts # rAF loop, camera state, sim→React bridge
  ui/
    App.tsx         # Mouse / keyboard input, layout
    Sidebar.tsx     # Body inspector panel
    TimeControls.tsx # Pause, time scale, fit-view, gravity field toggle
    Toolbar.tsx     # Reset, add-body mode, body type picker
    EventLog.tsx    # Collision / ejection event feed
```
