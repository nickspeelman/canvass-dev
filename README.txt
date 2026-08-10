CANVASS — v1.9.2

Open index.html directly for local development, or serve/deploy the folder over HTTPS for full PWA installation and offline support.

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


BRANDING + PWA — v1.7
- Product name: Canvass
- Compact Canvass logo/wordmark added to the instrument controls
- Browser favicon, Apple touch icon, and Android/PWA icons wired into the document
- Web app manifest configured for standalone installation
- Service worker caches the local app shell for offline use after the first successful load
- Navigation uses a network-first strategy so deployed updates are picked up when online, with the cached app available offline
- PWA display allows any orientation and respects device safe areas


PERFORMANCE GIF — v1.9.1
- Canvass continuously records a lightweight performance log: timestamped touch/pointer events plus color, brush-size, effect, clear, and canvas-setting changes.
- Render GIF reconstructs the current performance after the fact; there is no live GIF recording mode.
- Stochastic effects use a session seed, so Scatter, Spray, Bloom, and Bleed make the same random choices during replay.
- Flow and Echo use the recorded performance clock so their timing is replayable.
- Rendering is entirely client-side; no artwork or performance data is uploaded.
- GIF output preserves the performance timing, loops continuously, and is scaled to a maximum dimension of 480 px.
- Long sessions are automatically sampled to a practical maximum frame count rather than imposing a performance-time limit.
- Start again begins a new performance/session log. The session JSON download contains the replay data and random seed.

