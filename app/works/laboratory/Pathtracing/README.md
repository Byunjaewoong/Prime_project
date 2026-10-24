# Pathtracing

Progressive Cornell-box path tracing study based on the approach of [THREE.js-PathTracing-Renderer at a930973](https://github.com/erichlof/THREE.js-PathTracing-Renderer/tree/a930973667faf4502b427a01dd338a19522c8f6c) by Erich Loftis. The upstream project originates from Kevin Beason's smallPT and is [CC0-1.0](https://github.com/erichlof/THREE.js-PathTracing-Renderer/blob/a930973667faf4502b427a01dd338a19522c8f6c/LICENSE). Its bundled Three.js r185 is MIT licensed. This study uses the site's own WebGL2 shader and does not bundle the upstream Three.js copy.

Each frame traces diffuse and reflected paths with area-light sampling, then blends one sample per pixel into an RGBA16F render target. Camera movement resets accumulation. The renderer stops after 512 samples. It requires WebGL2 and `EXT_color_buffer_float`.
