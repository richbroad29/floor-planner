# Floor Planner — Brief (Phase B)

*Output of the BCDE "Brief" phase. Based on competitor research across consumer apps (Planner 5D, Floorplanner, RoomSketcher, HomeByMe, MagicPlan, Coohom), pro/specialist tools (SketchUp, Cedreo, Live Home 3D, SmartDraw, 2020 Design, IKEA Kitchen Planner) and free/open-source (Sweet Home 3D), plus a UX + tech-stack study.*

## 1. Product goal

A **free, browser-based 2D floor planner** that helps a homeowner plan the layout of any house — draw and **remove walls** (knock-throughs), lay out rooms, and place furniture, kitchen and bathroom fixtures. Plans **save to the cloud and sync across devices** via Google sign-in. Runs as a static site on GitHub Pages.

## 2. What the market taught us (the wedge)

- **Competitors paywall the *output*, not the design.** Almost every tool lets you draw for free, then gates clean export behind watermarks, SD-only images, export cooldowns, or per-project credits (Floorplanner's watermark + SD + 10-min cooldown is the most-complained-about thing in reviews).
  - **→ Our differentiator: the full design AND a clean, dimensioned, watermark-free PNG/PDF export stay genuinely free. Unlimited projects. Cross-device save.**
- **Fundamentals that make a free tool feel capable** (Sweet Home 3D): live length/angle entry, double-click a wall loop → auto room + area, drop a door → it auto-orients/resizes/cuts the wall, magnetism/snapping, and multi-level with the floor below greyed for tracing.
- **Modern, fluid canvas is an easy win** — the incumbents' weak spots are dated UX (Sweet Home 3D's Java look), clunky pan/zoom, and desktop-only tools.
- **Kitchen/bath depth is the premium frontier.** The single most transferable idea is the **"Countertop Wizard"** (auto-draw a worktop over a run of base cabinets) and **IKEA's snap-together modular cabinets that physically can't overlap** (a jargon-free clearance model). These are *nice-to-have / later*, not MVP.
- **Table stakes:** wall draw/edit/remove, auto room detection + area, typed dimensions, wall-snapping doors/windows, curated furniture + kitchen/bath library, multi-floor, cloud save.

## 3. MVP feature spec (the "Full 2D MVP" Rich chose)

### Must-have — the credible core
1. **Canvas** — smooth pan/zoom, toggleable grid, metric/imperial units.
2. **Wall tool** — click-to-place polyline with rubber-band preview; **live length + angle, editable by typing an exact value**; snapping to endpoints / existing walls / 0-45-90° angles / grid; close-loop detection; adjustable wall thickness (drawn as centreline, rendered as offset).
3. **Select / edit** — move walls; drag a corner node and **all attached walls follow** (shared-node model); edit a wall's length by typing; **delete/remove walls**.
4. **Auto room detection** — closed wall loops become named rooms with **live area** (shoelace); rename; assign a room *type* that auto-applies a floor colour/label.
5. **Doors & windows** — drag onto a wall; **host on the wall (slide with it), auto-orient, adjustable width**, door swing arc, window sill.
6. **Furniture + kitchen/bath fixtures library** — curated starter set: sofas, beds, tables, chairs, wardrobes; base/wall cabinets, worktop, sink, hob, oven, fridge, dishwasher; bath, shower, toilet, basin, vanity. Every item **resizable, rotatable, snaps to walls**.
7. **Undo/redo + copy/paste/duplicate + keyboard shortcuts.**
8. **Cloud save with autosave** — Google SSO; per-user projects resumable on any device (Supabase + row-level security).
9. **Watermark-free export** — dimensioned **PNG and PDF**, plus a "measured plan" view (dimensions on, furniture optionally hidden). *This is the wedge — keep it free.*
10. **Multi-floor** — add/duplicate floors (target 3-4); floor below shown faintly for alignment. *(Rich request — confirmed core.)*
11. **Save named versions / options** *(Rich request — promoted to core)* — within one project, snapshot the current layout as a named option (e.g. "Keep the wall" vs "Open-plan kitchen"); duplicate, switch between, rename and delete options. Directly serves the core "should I knock this through?" use case.
12. **Trace-from-image** *(promoted — prerequisite for Rightmove import)* — upload a photo/PDF as a background layer, set scale by drawing one known-length reference line, trace over it (opacity + rotation adjustable).

### Nice-to-have — v1.x, after the core is solid
- **Import floorplan from a Rightmove URL** *(Rich request)* — paste a property URL, we pull its floorplan image onto the trace layer. See §3.5 for the approach (needs a small serverless helper).
- **Shareable read-only link** (no sign-in for the viewer) — cheap virality; competitors gate this.
- **Snap-together modular cabinets with collision blocking** (IKEA model) + **auto worktop over a run** (Countertop Wizard).
- **Curved walls** (differentiator vs HomeByMe).
- **Simple 2D→3D extruded preview.**

### Later — post-MVP / premium candidates
- AI plan-image → editable plan (auto-detect walls/doors); parametric cabinet joinery; photorealistic renders; LiDAR/AR capture; DXF/DWG interop; partial-wall tiling / backsplash.

## 3.5 Feature deep-dive — Rightmove floorplan import (Rich request)

**The catch:** a static GitHub Pages site is pure browser JavaScript, and a browser **cannot fetch `rightmove.co.uk` directly** — cross-site requests are blocked by CORS, and Rightmove won't whitelist us. So "paste a URL → grab the floorplan" needs a **tiny server-side helper**.

**Chosen approach (fits our stack, stays free): a Supabase Edge Function.**
1. App sends the pasted Rightmove property URL to our Edge Function.
2. The function fetches the page server-side, parses the floorplan image URL out of Rightmove's embedded page data (`__NEXT_DATA__` → `floorplans[]`), and returns it (or proxies the image bytes to dodge image-hotlink/CORS limits).
3. The app drops that image on the **trace layer**; the user sets scale (draw a line over a known dimension, type the real length) and traces the walls.

**Fallbacks in the same feature** (always work, and cover the case where the parser breaks): **upload a floorplan image file**, or **paste a direct image URL**. These ship first; the Rightmove-URL convenience layers on top.

**Honest caveats:** (a) it depends on Rightmove's current page markup — if they change it, the parser needs a quick update; (b) automated fetching of a listing is arguably against Rightmove's terms — fine for personal, single-property planning, but we fetch only the floorplan image, nothing else; (c) floorplan images are rarely perfectly to scale, so **manual scale-calibration is always required** — the URL only saves the download step.

## 4. Data model (the plan document)

A **shared-node graph** — walls reference corner-node IDs, so moving a corner moves every attached wall; openings host on a wall via offset; rooms are derived faces. All lengths in one internal unit (**millimetres**), converted only for display. Serialisable straight to Supabase JSON.

```jsonc
{
  "schemaVersion": 1,
  "units": { "system": "metric", "displayUnit": "mm" },
  "grid": { "size": 100, "snap": true },
  "activeFloor": "fl1",
  "floors": [
    { "id": "fl1", "name": "Ground floor", "elevation": 0 }
  ],
  "layers": [
    { "id": "walls", "name": "Walls", "visible": true, "locked": false },
    { "id": "openings", "name": "Openings", "visible": true, "locked": false },
    { "id": "furniture", "name": "Furniture", "visible": true, "locked": false },
    { "id": "trace", "name": "Trace", "visible": true, "locked": true, "opacity": 0.5 }
  ],
  "nodes":     [ { "id": "n1", "floor": "fl1", "x": 0, "y": 0 } ],
  "walls":     [ { "id": "w1", "a": "n1", "b": "n2", "thickness": 100 } ],
  "openings":  [ { "id": "o1", "type": "door", "wallId": "w1", "offset": 800, "width": 900, "swing": "left-in" } ],
  "rooms":     [ { "id": "r1", "name": "Kitchen", "type": "kitchen", "boundary": ["n1","n2","n3","n4"], "auto": true } ],
  "furniture": [ { "id": "f1", "kind": "sofa", "x": 1500, "y": 800, "w": 2000, "h": 900, "rotation": 90 } ],
  "fixtures":  [ { "id": "fx1", "kind": "sink", "x": 500, "y": 300, "rotation": 0 } ],
  "traceImage": null
}
```

### Persistence & versioning (Rich request)

The JSON above is **one plan document = one saved option**. A **project** wraps many of them:

```
account (Google user)
└── project           e.g. "12 Acacia Avenue"
    ├── version/option "Keep the wall"      → plan document (JSON above)
    ├── version/option "Open-plan kitchen"  → plan document
    └── version/option "…"                  → plan document
```

Supabase schema (per-user, row-level security so you only see your own rows):
- `projects` — `id, owner (auth uid), name, created_at, updated_at`
- `plan_versions` — `id, project_id, name, plan (jsonb), thumbnail, created_at, updated_at`

**Local-first:** the store autosaves the active version to `localStorage` immediately (works with no account), and syncs to `plan_versions` on debounce once signed in — so nothing is ever lost and it resolves across devices.

## 5. Tech stack (decided)

| Concern | Choice | Why |
|---|---|---|
| Framework / build | **React + Vite**, static build | SPA, no server, deploys to GitHub Pages |
| Drawing surface | **SVG, declarative in React** | Free vector export (SVG/PNG/PDF), crisp at any zoom, free hit-testing; plans are small so DOM perf is a non-issue. Drag performance solved by mutating the dragged node via ref and committing to the store on pointer-up. |
| State | **Zustand + Immer** | Minimal, fast, serialises straight to Supabase |
| Undo/redo | **Zundo** (Zustand temporal) | Snapshot history with drag coalescing |
| PDF/PNG/SVG export | **jsPDF + svg2pdf.js**; SVG-serialise → canvas for PNG | Vector PDF from the SVG we already render |
| Trace underlay (later) | **pdf.js** | Render source PDF to a raster background |
| Auth + storage | **Supabase (Postgres + Auth), Google OAuth, row-level security** | Free tier, cross-device sync, projects + named versions keyed to the user |
| Rightmove import | **Supabase Edge Function** (server-side fetch/parse) | Only way to bypass browser CORS on rightmove.co.uk; free tier; same account as auth/storage |
| Hosting | **GitHub Pages**, repo `richbroad29/floor-planner` | Public URL `richbroad29.github.io/floor-planner/` |

*Runner-up drawing surface: react-konva — only if scenes ever grow very large (we'd lose free SVG export).*

## 6. Manual steps Rich will own (with click-by-click checklists when we reach them)
1. Create a free **Supabase** project.
2. Set up **Google sign-in** (Google Cloud OAuth client → paste client ID/secret into Supabase).
3. Create the **GitHub repo** `floor-planner` and **enable Pages** (the local token likely can't do these via API).
