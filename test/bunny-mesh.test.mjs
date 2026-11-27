import fs from 'node:fs/promises';
import { parsePLY } from '../src/plyParser.js';
import { HalfEdgeDS } from '../lib/half-edge.js';

const buffer = await fs.readFile(new URL('../assets/bun_zipper.ply', import.meta.url));
const { positions, indices } = parsePLY(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

const ds = new HalfEdgeDS();
ds.build(positions, indices);

const bbox = ds.computeBoundingBox();
const scale = 1.8 / Math.max(bbox.size[0], bbox.size[2]);

const tx = -bbox.center[0] * scale;
const ty = 1.6 - bbox.min[1] * scale;
const tz = -bbox.center[2] * scale;

const lowestVertexY = bbox.min[1];
const newY = (lowestVertexY * scale) + ty;

console.log("Y original mais baixo:", lowestVertexY);
console.log("Y após a transformação:", newY);
if (Math.abs(newY - 1.6) < 0.001) {
  console.log("O coelho está apoiado exatamente no topo da mesa");
} else {
  console.log("Erro no posicionamento");
}