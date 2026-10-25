# Interactive 3D visualization

This is the user's visualization workstream for Cal Hacks 13.0, developed from the supplied workstation prototypes. It is a local frontend with a real WebGL scene. Its shapes, response equations, and pathway particles are conceptual; it is not a calibrated microbial digital twin.

## Start and verify

From the repository root, run `sh scripts/dev.sh` and open http://127.0.0.1:5173/.

The launcher uses existing Node/pnpm installations or this Mac's bundled Codex runtime. On another computer, install Node.js 24 and pnpm 11.25.0; run `pnpm install --frozen-lockfile`, then `pnpm dev`. Use `pnpm build` and `pnpm test` for checks. If Node is available only through the Codex runtime, add its `node/bin` directory to PATH before invoking those checks directly.

Stop the server with Control-C in its terminal. Port 5173 is fixed so a busy port produces an actionable startup failure instead of silently changing the preview URL.

## Where to work

| File under `apps/web/src` | Responsibility |
|---|---|
| `CellScene.tsx` | Species geometry, GPU surface deformation, lighting, camera/orbit controls, ray picking, projected labels, animated pathway particles, resize and graphics cleanup |
| `App.tsx` | Workstation layout, environmental sliders, species selection, layer switches, inspector, help, and JSON download |
| `model.ts` | Typed chassis/structure definitions, scenario anchors, bounded illustrative response calculation, and export schema |
| `animation.ts` | Timer and particle interpolation guards for suspended tabs and invalid timestamps |
| `styles.css` | Colors, typography, layout, control styles, breakpoints, and reduced-motion styles |
| `model.test.ts`, `animation.test.ts` | Response boundaries, species labels, reset/presets, export consistency, and animation regression tests |

## How the visualization works

Environmental controls produce a typed `Environment` object. `calculateResponse` maps deviations from the selected chassis's demo reference into normalized visualization signals. React sends those signals to the scene; changing a slider updates shader uniforms without recreating the renderer. Switching chassis rebuilds its scene and disposes old geometries, materials, controls, listeners, and graphics resources.

The envelope uses a vertex shader for deformation and a translucent surface with a mesh overlay. Cutaway removes a hemisphere in model coordinates. Species-specific internal meshes can be selected through the scene or the inspector. Pathway dots move along illustrative curves between structures; they are not metabolic flux measurements.

Yeast uses a budding ellipsoid and schematic nucleus/mitochondria. Bacteria use a rod-shaped capsule, nucleoid, and membrane-associated energy markers. Archaea use a spherical envelope and genome region. No nucleus or mitochondria are assigned to the bacterial or archaeal models.

## Implemented interactions

- Drag/touch orbit, scroll/pinch zoom, camera reset, and explicit zoom buttons.
- Canvas arrow-key orbit and +/− zoom; keyboard-accessible structure buttons and controls.
- Species-specific scenario reset; heat and combined-stress presets with range clamping.
- Mesh, internal structures, cutaway, and pathway particle visibility switches.
- Pause/resume and independent auto-rotation switch; reduced-motion preference disables initial motion.
- Expanded model view and responsive layouts.
- Keyboard-contained help dialog with Escape dismissal and focus restoration.
- WebGL initialization/context interruption fallback, with a reload action.
- JSON export containing species, environment with units, response values, view settings, selection, model version, timestamp, and limitations.

Pause freezes animation time and auto-rotation. You can still change controls and inspect the model while paused. Export captures the scenario, not a resumable camera pose or exact animation frame.

## What to develop next

1. Refine one chassis at a time using scientist-reviewed visual references. The current geometry is schematic and not to scale.
2. Add a color/opacity and camera preset system if those controls help your demo.
3. Agree a versioned backend-to-visualizer response contract with your teammate. Preserve source IDs, units, uncertainty, missing values, and model version.
4. Replace illustrative response values only when a defined scientific model supplies validated outputs. Keep missing values explicit.

## Verification

Production build and strict TypeScript checking pass. All 17 automated tests pass. Browser checks covered all three species, stress/reset controls, structure selection, pathway navigation, cutaway, pause/resume, camera buttons, help dismissal, JSON download, and desktop/narrow layouts. A timing regression was fixed and fresh graphics checks reported no new errors.

The production bundler reports a size advisory for the combined Three.js application chunk (about 832 kB minified, 224 kB gzip). Code splitting and GPU/performance measurements on the demo machine remain follow-up work; no frame-rate target is claimed.
