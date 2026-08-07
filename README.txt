TOUCH INSTRUMENT — v1.2

Open index.html in Chrome. No server or build step is required.

BASELINE
- True multi-touch pointer drawing
- Red / yellow / blue / black / white
- Small / medium / large
- Local persistence
- One-tap Save Image button during drawing
- Finish dialog with PNG and session JSON export

COMPOSABLE BEHAVIORS
- Cycle: shared continuously advancing hue
- Connect: draws between simultaneous touches
- Echo: delayed repetitions
- Scatter: emits particles along movement
- Pull: attracts particles toward active touches
- Mirror: reflects marks horizontally
- Radial: six-fold rotational replication around the canvas center
- Drift: strokes keep traveling after the finger moves
- Orbit: with 2+ touches, creates rotating copies around the other active touches
- Repel: pushes particles away from active touches

NOTES
- Pull and Repel act on Scatter and Drift particles. If both are enabled, their forces cancel.
- Orbit is intentionally multi-touch: it has no effect with a single active touch.
- Radial composes with Mirror, so enabling both can produce up to twelve transformed copies.
- All behavior toggles and touch events are recorded in the exported session JSON.
