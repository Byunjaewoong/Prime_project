# SPlisHSPlasH browser study

This route implements a lightweight, interactive **3D Position Based Fluids (PBF)** study in TypeScript. It is informed by the PBF method in [SPlisHSPlasH](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH), an MIT-licensed C++ SPH library by Jan Bender and contributors. The original library runs as a native CMake project; this page does **not** embed or claim to be the full native engine.

The browser solver includes a 3D spatial hash for neighborhood lookup, Poly6 density kernel, Spiky pressure gradient, iterative density constraints, boundary collisions, XSPH velocity filtering, and a fixed 60 Hz step. Three.js renders particles in a rotatable tank. The menu exposes dam break, drop, and fountain scenes plus particle count, gravity, viscosity, and pressure iteration controls.

The default **Surface** display reconstructs a live mesh from the particle positions. It follows the particle-to-scalar-field-to-marching-cubes workflow of [SplashSurf](https://github.com/InteractiveComputerGraphics/splashsurf), with a compact metaball field tuned for this small browser scene. Reconstruction is throttled and its grid resolution and thickness are adjustable. **Particles** displays the original SPH particles. This is an interactive browser approximation: it does not run SplashSurf's Rust library or reproduce its domain decomposition, weighted Laplacian smoothing, and mesh cleanup stages.

For the complete SPlisHSPlasH solver set (including DFSPH, IISPH, WCSPH, deformable solids, rigid-fluid coupling, and exports), use the [upstream C++ project](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH) and its [documentation](https://splishsplash.readthedocs.io/).
