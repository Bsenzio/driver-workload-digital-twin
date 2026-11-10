# Visual assets

| Asset | Provenance and use |
| --- | --- |
| `public/models/aster.glb` | Original procedural geometry and materials generated for this project. No external meshes, textures or manufacturer marks. The ~78 KB GLB is loaded locally in the follow-camera scene. |
| `public/models/static-vehicle.svg` | Original vector illustration for the static fallback. |
| `docs/demo.png` | Screenshot of the running production build at the Highway Cruise diagnostic burst. |
| `public/models/static-cabin.svg` | Original vector illustration for the static cabin fallback. |
| `docs/can-lab.png` | Screenshot of the three fitted models and a diagnostics probe. |
| Road, markers, barricade and lights | Original primitives and materials in `src/scene/scene.js`. |
| Cabin, avatar and traffic vehicles | Original procedural geometry in `src/scene/cabin.js` and color variants of the project car. Both cameras share one WebGL renderer. |

Regenerate the GLB from the repository root with `node scripts/generate-car.js` after installing dependencies. The live fallback uses the same geometry source in `src/scene/car.js`. The original visual assets are covered by the repository's MIT license. Three.js and Vite are separately licensed dependencies. The site uses local system fonts and has no runtime asset provider.
