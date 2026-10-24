# Cloud

Browser study of tileable 3D cloud noise and volume raymarching.

- Source concept: [TileableVolumeNoise at 1f879a2](https://github.com/sebh/TileableVolumeNoise/tree/1f879a26b89aaa4b5a7f112f14ec149d08057661), by Sébastien Hillaire with weirdfoo, MIT license. [License text](https://github.com/sebh/TileableVolumeNoise/blob/1f879a26b89aaa4b5a7f112f14ec149d08057661/LICENSE.md).
- The upstream code credits Marc-André Loyer for the Worley cell function.
- This page adapts the periodic value-noise and nearest-cell ideas in GLSL. Its raymarching, lighting, UI, and camera are implemented here; no upstream C++ files are bundled.

Requires WebGL2. Drag horizontally to change view. Coverage, density, and sun direction are available in Controls.
