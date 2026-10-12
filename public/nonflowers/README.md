Nonflowers by Lingdong Huang (2018), vendored from
https://github.com/LingDong-/nonflowers under the MIT license in LICENSE.

The original Canvas generator runs in an iframe so its modifications to global
JavaScript objects remain isolated from the rest of the site. The local HTML and
CSS host the full-screen vintage wildflower composition in pattern.js.

pattern.js reuses the upstream seeded PRNG, Perlin noise, paper, leaf and
variable-width stroke primitives. It adds scalloped petals with pigment washes,
veins and stamens, umbel clusters, layered meadow placement, and paper controls.
The six tone presets and custom color picker recompose cached flowers without
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
button regenerates only the original plant and randomizes its total size to
45–55%, stem length to 80–400%, and petal length to 60–180%. The vintage
composition remains reproducible from its separate seed. Each vintage plant
has a depth value and independent paint seed. Plants are sorted by depth, and
the original plant is painted between rear and front vintage flowers. Mixed mode
draws a complete original Nonflowers plant using
the upstream `woody()` or `herbal()` function with original `genParams()` values.
The upstream geometry, branching, leaves, petals, color and filtering stay
together. The finished plant raster has its pigment alpha raised to opaque,
while low-alpha silhouette edges remain soft; it is then cropped and positioned
within the meadow. Vintage flower heads are also drawn without layer opacity.
The URL saves `mode=mixed`, `mixedSeed`, `vintage=0` when hidden, and all control
values so the full composition can be reopened.

Rendering yields between small plant batches, caps the backing canvas at 3.2M
pixels, cancels superseded generations and releases replaced canvases. Resizing
recomposes for the new aspect ratio; no continuously running animation is used.

The bundled Material Icons font is from Google's Material Design Icons project
and is licensed under Apache 2.0; its license text is in fonts/LICENSE.
