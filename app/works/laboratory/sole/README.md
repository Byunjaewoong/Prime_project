# Sole image shape extraction

`Image shape` accepts a PNG, JPEG, or WebP outsole image. The browser composites transparency over white, thresholds luminance using the Darkness control, removes tiny isolated regions, traces the remaining pixel boundaries, and fits the resulting SVG paths into the 420 × 1000 view box. The original image pixels are not rendered or included in the downloaded SVG. Clean, high-contrast images with one sole work best; busy photographic backgrounds may need cropping or background removal first.

The bundled example (`public/sole-reference.png`) is cropped and resized from [Schoenafdruk.png by Rens ten Hagen](https://commons.wikimedia.org/wiki/File:Schoenafdruk.png), released under CC0. It is only a demonstration input; the displayed shape is produced by the same extraction code used for uploads.

The `Generated` view holds the original traced shoe outline fixed and clips all interior geometry to it. Its 12 selectable studies redraw the tread structures of real shoes as original vector paths; no product image, logo, or manufacturer artwork is bundled. `new pattern` selects a different product study without changing the outer silhouette. The selected product page is linked below the preview.

| Study | Structural reference |
| --- | --- |
| [Nike Air Force 1](https://www.nike.com/t/air-force-1-07-mens-shoes-XVPIszaq) | concentric pivot circles |
| [Vans Authentic](https://www.vans.com/en-us/p/shoes/icons/authentic-5310/authentic-shoe-VN000EE3BLK) | dense waffle recesses |
| [Converse Chuck Taylor](https://www.converse.com/shop/p/chuck-taylor-all-star-canvas-unisex-high-top-shoe/M9006MP.html) | diamond traction |
| [adidas Samba OG](https://www.adidas.com/us/samba-og-shoes/JI4218.html) | gum pivot points and fine grooves |
| [adidas Superstar](https://www.adidas.com/us/girls-back_to_school-superstar) | herringbone traction |
| [Salomon Speedcross 6](https://www.salomon.com/en-us/product/speedcross-6-lg9212/L47811000) | deep directional mud lugs |
| [Merrell Moab 3](https://www.merrell.com/US/en/moab-3/52481M.html) | broad hiking lugs and open channels |
| [Timberland Premium 6-Inch](https://www.timberland.com/en-us/p/men/footwear-10039/mens-timberland-premium-6-inch-waterproof-boot-TB010073001) | heavy rubber blocks |
| [Dr. Martens 1460](https://www.drmartens.com/uk/en_gb/icons/1460) | 5/3 cleat cadence |
| [ASICS GEL-KAYANO 31](https://me.asics.com/en-ae/gel-kayano-31-1011b867-300.html) | split grip zones and short sipes |
| [On Cloud 6 Waterproof](https://www.on.com/en-us/products/cloud-6-wp-3mf1006/mens/black-black-shoes-3MF10061043) | connected rubber pods |
| [Nike Pegasus 37](https://niketeam.nike.com/niketeamsports/content/pdf/catalog_thumbs/NTS_W_Running.pdf) | horizontal lugs and perforated perimeter |

These are recognizable structural studies rather than exact 1:1 reproductions: the reference shoes have their own exterior proportions, while this work intentionally keeps one outer shoe shape across every option.
