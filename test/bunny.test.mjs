import fs from 'node:fs/promises';
import { parsePLY } from '../src/plyParser.js';
import { HalfEdgeDS } from '../lib/half-edge.js';

function assert(cond, msg) {
  if (!cond) { console.error('ERRO', msg); process.exit(1); }
  console.log('OK', msg);
}

{
  const coords = [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ];
  const trigs = [
    0, 2, 1,
    0, 1, 3,
    0, 3, 2,
    1, 2, 3,
  ];
  const ds = new HalfEdgeDS();
  ds.build(coords, trigs);

  assert(ds.vertices.length === 4, 'tetraedro: 4 vértices');
  assert(ds.faces.length === 4, 'tetraedro: 4 faces');
  assert(ds.halfEdges.length === 12, 'tetraedro: 12 half-edges');

  const boundaries = ds.halfEdges.filter(h => h.opposite === null).length;
  assert(boundaries === 0, 'tetraedro fechado: 0 half-edges de borda');

  for (const v of ds.vertices) {
    const len = Math.hypot(...v.normal);
    assert(Math.abs(len - 1) < 1e-6, `normal do vértice ${v.vid} unitária`);
  }
}


{
  const ds = new HalfEdgeDS();
  ds.build(
    [0,0,0,  1,0,0,  0,1,0],
    [0,1,2],
  );
  const boundaries = ds.halfEdges.filter(h => h.opposite === null).length;
  assert(boundaries === 3, 'triângulo isolado: 3 half-edges de borda');

  for (const v of ds.vertices) {
    const len = Math.hypot(...v.normal);
    assert(Math.abs(len - 1) < 1e-6, `triângulo isolado: normal unitária no vértice ${v.vid}`);
  }
}

{
  const buffer = await fs.readFile(new URL('../assets/bun_zipper.ply', import.meta.url));
  const { positions, indices } = parsePLY(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

  const ds = new HalfEdgeDS();
  ds.build(positions, indices);

  console.log('\n--- Stanford Bunny ---');
  console.log('Vértices:', ds.vertices.length);
  console.log('Faces:', ds.faces.length);
  console.log('Half-edges:', ds.halfEdges.length);

  const boundary = ds.halfEdges.filter(h => h.opposite === null).length;
  console.log('Half-edges de borda:', boundary);
  assert(boundary > 0, 'Bunny tem bordas abertas na base ');

  assert(ds.vertices.length > 30000, 'Bunny com > 30k vértices');

  let nonUnit = 0;
  for (const v of ds.vertices) {
    const len = Math.hypot(...v.normal);
    if (Math.abs(len - 1) > 1e-3) nonUnit++;
  }
  assert(nonUnit === 0, `Todas as normais unitárias. Inválidas: ${nonUnit}`);

  const bbox = ds.computeBoundingBox();
  console.log('BBox min:', bbox.min);
  console.log('BBox max:', bbox.max);
  console.log('BBox size:', bbox.size);
  console.log('BBox center:', bbox.center);

  const mesh = ds.getMeshData();
  assert(mesh.positions.length === ds.vertices.length * 3, 'positions ok');
  assert(mesh.normals.length   === ds.vertices.length * 3, 'normals ok');
  assert(mesh.indices.length   === ds.faces.length * 3, 'indices ok');
}