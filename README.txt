TOUCH INSTRUMENT — v1.4

Open index.html in Chrome. No server or build step is required.

BASELINE
- True multi-touch pointer drawing
- Red / yellow / blue / black / white
- Small / medium / large
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

OFFSET
Offset is fully deterministic. For canvas dimensions W × H, a touch at (x, y) paints at (W - x, H - y). Gesture shape and movement are preserved, but appear on the opposite side of the canvas.

NOTES
- Flow, Offset, Radial, and Mirror are composable spatial transformations.
- Bloom and Spray can also be transformed by Flow/Offset/Radial/Mirror because they emit ordinary marks through the same pipeline.
- Orbit is intentionally multi-touch: it has no effect with a single active touch.
- All behavior toggles and touch events are recorded in the exported session JSON.


v1.5 adds composable Fractal branching and watercolor-like Bleed behaviors.
