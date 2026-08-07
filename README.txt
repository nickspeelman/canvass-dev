TOUCH INSTRUMENT — V1
=====================

Run it
------
Extract the folder and open index.html in Chrome.
No server, build step, npm install, or internet connection is required.

Best experience
---------------
Use a touchscreen Chromebook/tablet in landscape orientation and tap “Full screen”.
The canvas uses Pointer Events and supports simultaneous touches.

Controls
--------
Behaviors can be combined freely:

Cycle   Shared hue advances as marks are made.
Connect Paints lines between simultaneous touch points.
Echo    Repeats marks after short delays.
Scatter Emits moving secondary marks from strokes.
Pull    Active touches attract Scatter particles.
Mirror  Duplicates marks across the vertical axis.

Colors: red, yellow, blue, black, white.
Sizes: small, medium, large.

Finish
------
Download image: saves the current canvas as PNG.
Download session: saves normalized touch/configuration events as JSON.
Start again: clears the canvas and begins a fresh session record.

Persistence
-----------
The current drawing is saved in browser localStorage and restored on reload.

Notes
-----
This is intentionally a v1 behavior sandbox. There is no backend or upload/contribution flow yet.
