# Sole image shape extraction

`Image shape` accepts a PNG, JPEG, or WebP outsole image. The browser composites transparency over white, thresholds luminance using the Darkness control, removes tiny isolated regions, traces the remaining pixel boundaries, and fits the resulting SVG paths into the 420 × 1000 view box. The original image pixels are not rendered or included in the downloaded SVG. Clean, high-contrast images with one sole work best; busy photographic backgrounds may need cropping or background removal first.

The bundled example (`public/sole-reference.png`) is cropped and resized from [Schoenafdruk.png by Rens ten Hagen](https://commons.wikimedia.org/wiki/File:Schoenafdruk.png), released under CC0. It is only a demonstration input; the displayed shape is produced by the same extraction code used for uploads.
