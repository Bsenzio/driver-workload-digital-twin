import { writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildCar } from '../src/scene/car.js';

// The exporter uses FileReader for the binary container. Node provides Blob.arrayBuffer.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend();
    });
  }
};

const buffer = await new GLTFExporter().parseAsync(buildCar(), { binary: true });
await writeFile(new URL('../public/models/aster.glb', import.meta.url), new Uint8Array(buffer));
