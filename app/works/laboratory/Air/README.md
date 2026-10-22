# Air

Air runs Eric Bruneton's 2017 **Precomputed Atmospheric Scattering** WebGL2 demo inside the Laboratory. The generated GLSL shaders and lookup tables are copied from the [official WebGL demo](https://ebruneton.github.io/precomputed_atmospheric_scattering/demo.html); the browser renderer adapts the [original `demo.js`](https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/demo/webgl/demo.js) to React, responsive layouts, and pointer input. Copyright and redistribution terms are included in `public/air/bruneton/LICENSE` (BSD 3-Clause).

The model uses precomputed transmittance, scattering, and irradiance textures. The original fragment shader evaluates sky radiance, atmospheric attenuation, the sun, terrain, and the demo sphere from those tables. This page does not replace the model with a color gradient or a different sky approximation.

Controls: drag to orbit the camera; Shift/Ctrl + drag to move the sun on desktop; wheel to change viewing distance; use the M menu for touch-friendly sun, distance, exposure, and view presets. Rendering runs on demand when the view changes. WebGL2 is required.

The original data files are 16.3 MB in total, with the 3D scattering lookup table accounting for 16 MB. A loading indicator stays visible until all assets and shaders are ready. On portrait screens, the framing keeps the sphere close to its desktop width and raises the horizon for a composition similar to the reference image.
