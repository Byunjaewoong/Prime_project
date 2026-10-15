Nonflowers by Lingdong Huang (2018), vendored from
https://github.com/LingDong-/nonflowers under the MIT license in LICENSE.

The original Canvas generator runs in an iframe so its modifications to global
JavaScript objects remain isolated from the rest of the site. The local HTML and
CSS host the full-screen vintage wildflower composition in pattern.js.

pattern.js reuses the upstream seeded PRNG, Perlin noise, paper, leaf and
variable-width stroke primitives. It adds scalloped petals with pigment washes,
veins and stamens, umbel clusters, layered meadow placement, and paper controls.
The eighteen tone presets and custom color picker recompose cached flowers without
changing the arrangement. Random regeneration chooses a fresh crypto seed;
the iframe URL's numeric seed reproduces the arrangement at the same viewport.
The menu also exports the full composition as PNG, including its selected tone.
The default vintage framing uses a taller 1350-unit field, 85% flower heads and
115% stem spacing for a wider view with longer visible stalks. The menu lets
visitors adjust bloom size (50–140%), stem length (95–145%) and output resolution
(1×, 1.5× or 2×, subject to a 3.2–6 megapixel canvas budget). These settings
are stored in the URL with the seed and apply to PNG exports.
In Mixed mode, the original plant has separate controls for total scale
(40–120%, default 50%), stem length (80–400%, default 120%) and petal length
(60–180%, default 100%). Herbaceous stems use `PAR.stemLength`; woody stems
use an optional root branch length passed to the otherwise original branching
algorithm. The shared output resolution control also applies to Mixed mode.
Long stems use a bounded internal raster size so 400% can render without an
unbounded canvas allocation; the stem slider renders when released.
The mixed plant uses a fixed composition scale independent of its stem length;
its internal raster downscale is reversed when placing it, keeping petals and
leaves the same on-screen size as the stem length changes. Woody branching only
lengthens the root stem; child branches keep their original length distribution.
The Flower Shape menu has a Vintage mode and a Mixed mode. The Vintage flowers
switch hides or restores the meadow without changing its seed. The Mixed flower
button adds another original plant without removing earlier plants. Each added
plant has an independent seed, depth and shape parameters. The button randomizes
the new plant's total size to
60–80%, stem length to 80–400%, and petal length to 60–180%. The vintage
composition remains reproducible from its separate seed. Each vintage plant
has a depth value and independent paint seed. All plants are sorted by depth,
so every original plant can sit between rear and front vintage flowers. The
Mixed controls edit the latest added plant. The general regeneration button
starts a new composition with one original plant. Mixed mode
draws a complete original Nonflowers plant using
the upstream `woody()` or `herbal()` function with original `genParams()` values.
The upstream geometry, branching, leaves, petals, color and filtering stay
together. The finished plant raster has its pigment alpha raised to opaque,
while low-alpha silhouette edges remain soft; it is then cropped and positioned
within the meadow. Vintage flower heads are also drawn without layer opacity.
The URL saves `mode=mixed`, `mixedSeed`, a `mix` list of plants and their depths,
`vintage=0` when hidden, and all control values so the full composition can be
reopened.

Rendering yields between small plant batches, caps the backing canvas at 3.2M
pixels, cancels superseded generations and releases replaced canvases. Resizing
recomposes for the new aspect ratio; no continuously running animation is used.
Mixed plants are cached as cropped transparent sprites keyed by their seed and
shape controls. Vintage flower sprites are cached under a mobile/desktop pixel
budget; changing the vintage composition or viewport invalidates that cache.
Adding a plant therefore generates only its new geometry while the existing
flowers are drawn from sprites in depth order. The upstream filter skips fully
transparent pixels, which preserves its visible noise and color while avoiding
millions of needless noise evaluations per generated plant.

The bundled Material Icons font is from Google's Material Design Icons project
and is licensed under Apache 2.0; its license text is in fonts/LICENSE.

Pattern mode composes complete Nonflowers plants and stemless flower clusters.
The latter use the same `herbal()` generator but omit its stem-and-leaf layer.
The default is 40% stemmed size, 30% stem length, 20 units of spacing, and a
100:0 stemmed-to-cluster ratio. A five-unit grid records painted silhouette
area. An approximate distance field measures the gap across sampled painted
pixels and each motif's center of mass, so spacing is judged over the whole
shape. Placement also favors uncovered regions. The pattern extends 12% beyond
every viewport edge so changing the window does not expose a hard border. The
number of motifs scales with canvas area, and placement stops near 95% total
and 97% visible spatial coverage (or when no fitting space remains). A bounded
50-seed model pool keeps the original flower raster work manageable while
reducing repeated silhouettes. A visible progress bar shows the spatial fill
percentage and placed flower count. During resize the previous canvas keeps
its proportions until the new composition is ready.
Regenerate pattern chooses a new seed; the controls and seed are saved in the
URL. Cached sprites are reused when spacing and ratio change, and the PNG
export includes the entire composition.

Click the painting to release a watercolor white butterfly. Original flower
targets are sampled from the petal layer before it is combined with stems and
leaves; sprite cropping, scaling and pattern rotations carry these sites into
the final canvas. Hidden or offscreen sites are rejected before landing.
Butterflies glide between randomized waypoints and turn as the wings fold,
with roughly three to four wingbeats per second at takeoff. Both flight and
wingbeats slow down to land; perched wings open and close every 4.5–6.5 seconds.
The gently wandering route is sampled at equal distances to maintain an even
cruising speed, with a small forward pulse as the wings open. Flight rendering
averages five poses over 1/48 second (a virtual 24 fps, 180-degree shutter),
giving wings and body a short motion blur without accumulating trails. Their painted
wing sprites and animation use an independent random stream and overlay canvas.
The two wing layers are precomposed once; with four or more butterflies in flight,
three exposure samples retain the shutter effect while reducing canvas work.
Once perched, butterflies fly to another petal after a strong phone shake or a
fast desktop mouse movement. Small movements and repeated triggers are ignored;
on iOS, the first canvas tap also requests motion-sensor access.
When several butterflies are startled together, their departures are staggered,
their cruising speeds vary, and some make a broad curved detour before landing.
Up to twelve butterflies can remain in the scene; a new composition clears
them, and animation pauses when the browser tab is hidden.
