TOUCH INSTRUMENT — v1.6

Open index.html in Chrome. No server or build step is required.

BASELINE
- True multi-touch pointer drawing
- Compact touchscreen-responsive control bar
- Red / yellow / blue plus a custom color picker with hex/RGB input
- Small / medium / large brushes
- Local persistence
- One-tap Save Image button during drawing
- Finish dialog with PNG and session JSON export
- Responsive, preset, and custom canvas dimensions

COMPOSABLE BEHAVIORS
- Cycle: shared continuously advancing hue
- Connect: draws between simultaneous touches
- Echo: delayed repetitions
- Scatter: original particle scatter behavior, unchanged
- Flow: smoothly deforms marks through a slowly evolving spatial flow field
- Bloom: grows irregular rings/cellular forms along gestures
- Spray: deposits a soft aerosol-like cloud around movement
- Offset: moves paint to the point directly opposite the touch across the canvas center
- Mirror: reflects marks horizontally
- Radial: six-fold rotational replication around the canvas center
- Drift: strokes keep traveling after the finger moves
- Orbit: with 2+ touches, creates rotating copies around the other active touches
- Fractal: expands gestures into shallow branching families
- Bleed: deposits watercolor-like spreading marks

EFFECTS MENU
- Effects are collapsed into a pop-up menu to preserve drawing space.
- The Effects button shows the number currently enabled.
- Select all and Unselect all toggle the complete effect set at once.

CANVAS LIFECYCLE
- Artwork is stored on a dedicated off-screen canvas rather than the resizable display canvas.
- Resize, rotation, tab visibility changes, and page restoration rebuild the display from that canonical artwork state.
- Clearing clears both the canonical artwork and pending particles/echoes.

OFFSET
Offset is fully deterministic. For canvas dimensions W × H, a touch at (x, y) paints at (W - x, H - y). Gesture shape and movement are preserved, but appear on the opposite side of the canvas.

NOTES
- Flow, Offset, Radial, and Mirror are composable spatial transformations.
- Bloom and Spray can also be transformed by Flow/Offset/Radial/Mirror because they emit ordinary marks through the same pipeline.
- Orbit is intentionally multi-touch: it has no effect with a single active touch.
- All behavior toggles and touch events are recorded in the exported session JSON.
