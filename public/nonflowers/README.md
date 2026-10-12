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
The Flower Shape menu has a Vintage mode and a Mixed mode. Mixed regeneration
draws the vintage meadow and then a complete original Nonflowers plant using
the upstream `woody()` or `herbal()` function with original `genParams()` values.
The upstream geometry, branching, leaves, petals, color and filtering stay
together; only the finished transparent plant image is cropped and positioned
within the meadow. The URL saves `mode=mixed` with the seed.

Rendering yields between small plant batches, caps the backing canvas at 3.2M
pixels, cancels superseded generations and releases replaced canvases. Resizing
recomposes for the new aspect ratio; no continuously running animation is used.

The bundled Material Icons font is from Google's Material Design Icons project
and is licensed under Apache 2.0; its license text is in fonts/LICENSE.
