CANVAS — v1.9.20

Open index.html directly for local development, or serve/deploy the folder over HTTPS for full PWA installation and offline support.

BASELINE
- True multi-touch pointer drawing
- Compact touchscreen-responsive control bar
- Red / yellow / blue plus a visual custom color field with hex/RGB input
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
- Product name: Canvas
- Compact Canvas logo/wordmark added to the instrument controls
- Browser favicon, Apple touch icon, and Android/PWA icons wired into the document
- Web app manifest configured for standalone installation
- Service worker caches the local app shell for offline use after the first successful load
- Navigation uses a network-first strategy so deployed updates are picked up when online, with the cached app available offline
- PWA display allows any orientation and respects device safe areas


PERFORMANCE GIF — v1.9.1
- Canvas continuously records a lightweight performance log: timestamped touch/pointer events plus color, brush-size, effect, clear, and canvas-setting changes.
- Render GIF reconstructs the current performance after the fact; there is no live GIF recording mode.
- Stochastic effects use a session seed, so Scatter, Spray, Bloom, and Bleed make the same random choices during replay.
- Flow and Echo use the recorded performance clock so their timing is replayable.
- Rendering is entirely client-side; no artwork or performance data is uploaded.
- GIF output preserves the performance timing, loops continuously, and is scaled to a maximum dimension of 480 px.
- Long sessions are automatically sampled to a practical maximum frame count rather than imposing a performance-time limit.
- Start again begins a new performance/session log. The session JSON download contains the replay data and random seed.


GIF CLEAR BOUNDARY (v1.9.6)
- Render GIF always begins at the most recent Clear action.
- Anything drawn or configured before that Clear is excluded from the exported timeline.
- Clear captures the active tool/effect state, current canvas dimensions, and a fresh deterministic random seed so stochastic effects replay consistently after the boundary.


CUSTOM COLOR PICKER (v1.9.9)
----------------------------
- Restored the original browser-native visual color picker used before the mobile-centering changes.
- Kept Hex/RGB text entry.
- Mobile centering now affects only the popover container; the picker itself is unchanged.


DEPLOYMENT CACHE COHERENCE (v1.9.11)
------------------------------------
- Same-origin app assets now use network-first loading with cached offline fallback.
- When an updated service worker takes control, the page reloads automatically once.
- This prevents a newly deployed index from being paired with stale CSS/JavaScript from an older cached release.


BRANDING + SEO — v1.9.17
------------------------
- Product name and public hostname restored to Canvas / canvas.nickspeelman.com.
- Added canonical URL, search-engine robots directives, Open Graph metadata, LinkedIn-friendly social preview metadata, and X/Twitter large-card metadata.
- Added Schema.org WebApplication JSON-LD structured data.
- Added favicon-48.png reference alongside the existing favicon, Apple touch icon, and Android/PWA icons.
- Added robots.txt and sitemap.xml.
- Social preview image expected at assets/icons/canvas-social.png (1200 × 627).
- Downloaded PNG, GIF, and session JSON filenames now use the canvas- prefix.


FINISH ACTIONS — v1.9.18
------------------------
- Finish dialog now includes Render GIF, using the existing performance GIF renderer unchanged.
- Finish dialog now includes Share, which uses the native Web Share API to share the finished PNG where supported.
- Finish > Download image now performs a direct PNG download on mobile instead of invoking the share sheet.


GIF MODAL RETURN — v1.9.19
--------------------------
- When Render GIF is launched from Finish, closing the GIF modal now returns to the Finish modal.
- GIF rendering launched from the normal GIF control retains its prior close behavior.


GIF DOWNLOAD — v1.9.20
----------------------
- Download GIF now bypasses the mobile native-share helper and directly downloads the rendered .gif.
