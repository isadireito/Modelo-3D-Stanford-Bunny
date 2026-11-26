import assert from "node:assert/strict";
import { marchingCubes } from "../src/marchingCubes.js";
import { EDGE_TABLE, TRI_TABLE, EDGE_CORNERS } from "../src/marchingCubesTables.js";
import { createTableMesh } from "../src/tableMesh.js";
import { createFloorMesh } from "../src/floorMesh.js";
import { TABLE_BOUNDS, TABLE_RESOLUTION, tableField } from "../src/implicit.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

function analyze(mesh) {
  const { positions, normals, indices } = mesh;
  const vertexCount = positions.length / 3;
  const faceCount = indices.length / 3;
  const directed = new Map();
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = indices[f * 3 + e];
      const b = indices[f * 3 + ((e + 1) % 3)];
      const key = a * vertexCount + b;
      directed.set(key, (directed.get(key) || 0) + 1);
    }
  }
  let nonManifold = 0;
  let unpaired = 0;
  for (const [key, count] of directed) {
    const a = Math.floor(key / vertexCount);
    const b = key % vertexCount;
    if (count !== 1) nonManifold++;
    if (directed.get(b * vertexCount + a) !== 1) unpaired++;
  }
  let area = 0;
  let volume = 0;
  let misoriented = 0;
  const misorientedY = [];
  for (let f = 0; f < faceCount; f++) {
    const i0 = indices[f * 3] * 3;
    const i1 = indices[f * 3 + 1] * 3;
    const i2 = indices[f * 3 + 2] * 3;
    const p0 = positions.subarray(i0, i0 + 3);
    const p1 = positions.subarray(i1, i1 + 3);
    const p2 = positions.subarray(i2, i2 + 3);
    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    area += len / 2;
    volume += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
    if (len > 1e-12) {
      const avg = [0, 0, 0];
      for (const i of [i0, i1, i2]) for (let c = 0; c < 3; c++) avg[c] += normals[i + c];
      if (n[0] * avg[0] + n[1] * avg[1] + n[2] * avg[2] <= 0) {
        misoriented++;
        misorientedY.push((p0[1] + p1[1] + p2[1]) / 3);
      }
    }
  }
  const edgeCount = directed.size / 2;
  return { vertexCount, faceCount, edgeCount, euler: vertexCount - edgeCount + faceCount, nonManifold, unpaired, area, volume, misoriented, misorientedY };
}

test("tabelas: edgeTable coerente com triTable e com os sinais dos cantos", () => {
  for (let c = 0; c < 256; c++) {
    let used = 0;
    for (let n = 0; TRI_TABLE[c * 16 + n] !== -1; n++) used |= 1 << TRI_TABLE[c * 16 + n];
    assert.equal(used, EDGE_TABLE[c], `caso ${c}`);
    let cut = 0;
    for (let e = 0; e < 12; e++) {
      const [a, b] = EDGE_CORNERS[e];
      if (((c >> a) & 1) !== ((c >> b) & 1)) cut |= 1 << e;
    }
    assert.equal(cut, EDGE_TABLE[c], `caso ${c}`);
  }
});

test("esfera: vertices sobre a superficie, malha fechada e orientada para fora", () => {
  const radius = 1;
  const mesh = marchingCubes({
    field: (x, y, z) => Math.hypot(x, y, z) - radius,
    gradient: (x, y, z) => [x, y, z],
    min: [-1.5, -1.5, -1.5],
    max: [1.5, 1.5, 1.5],
    resolution: [48, 48, 48],
  });
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const r = Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
    assert.ok(Math.abs(r - radius) < 2e-3);
  }
  const s = analyze(mesh);
  assert.equal(s.nonManifold, 0);
  assert.equal(s.unpaired, 0);
  assert.equal(s.euler, 2);
  assert.equal(s.misoriented, 0);
  assert.ok(Math.abs(s.area - 4 * Math.PI) / (4 * Math.PI) < 0.01);
  assert.ok(Math.abs(s.volume - (4 / 3) * Math.PI) / ((4 / 3) * Math.PI) < 0.01);
});

test("mesa: malha fechada, genero zero, orientada para fora", () => {
  const mesh = createTableMesh();
  const s = analyze(mesh);
  console.log(`   resolucao ${TABLE_RESOLUTION.join("x")}: ${s.vertexCount} vertices, ${s.faceCount} triangulos`);
  assert.equal(s.nonManifold, 0);
  assert.equal(s.unpaired, 0);
  assert.equal(s.euler, 2);
  assert.ok(s.volume > 0);
  const awayFromCreases = s.misorientedY.filter(y => Math.abs(y) > 0.05 && Math.abs(y - 1.6) > 0.05);
  assert.equal(awayFromCreases.length, 0);
  assert.ok(s.misoriented / s.faceCount < 0.02);
});

test("mesa: dimensoes coincidem com a funcao implicita", () => {
  const mesh = createTableMesh();
  const p = mesh.positions;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxRadius = 0;
  let waist = Infinity;
  const residuals = [];
  for (let i = 0; i < p.length; i += 3) {
    minY = Math.min(minY, p[i + 1]);
    maxY = Math.max(maxY, p[i + 1]);
    const r = Math.hypot(p[i], p[i + 2]);
    maxRadius = Math.max(maxRadius, r);
    if (Math.abs(p[i + 1] - 0.8) < 0.02) waist = Math.min(waist, r);
    residuals.push(Math.abs(tableField(p[i], p[i + 1], p[i + 2])));
  }
  assert.ok(Math.abs(minY - 0) < 1e-5);
  assert.ok(Math.abs(maxY - 1.6) < 1e-5);
  assert.ok(Math.abs(maxRadius - 1.4) < 0.025);
  assert.ok(Math.abs(waist - 0.6) < 5e-3);
  residuals.sort((a, b) => a - b);
  assert.ok(residuals[Math.floor(residuals.length / 2)] < 5e-4);
  assert.ok(residuals[residuals.length - 1] < 0.03);
  for (let i = 0; i < p.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      assert.ok(p[i + c] >= TABLE_BOUNDS.min[c] && p[i + c] <= TABLE_BOUNDS.max[c]);
    }
  }
});

test("mesa: area e volume proximos dos valores analiticos", () => {
  const s = analyze(createTableMesh());
  const volume = Math.PI * (0.36 * 1.6 + 2.5 * (2 * 0.8 ** 3) / 3);
  assert.ok(Math.abs(s.volume - volume) / volume < 0.005, `volume ${s.volume} vs ${volume}`);
});

test("mesa: normais unitarias e topo/base planos", () => {
  const mesh = createTableMesh();
  const { positions: p, normals: n } = mesh;
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < n.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-5);
    if (Math.abs(p[i + 1] - 1.6) < 1e-5 && n[i + 1] > 0.999) top++;
    if (Math.abs(p[i + 1]) < 1e-5 && n[i + 1] < -0.999) bottom++;
  }
  assert.ok(top > 1000 && bottom > 1000);
});

test("chao: coordenadas UV, normais e orientacao", () => {
  const floor = createFloorMesh({ halfSize: 8, divisions: 4, repeat: 8 });
  assert.equal(floor.positions.length / 3, 25);
  assert.equal(floor.indices.length / 3, 32);
  assert.equal(Math.max(...floor.uvs), 8);
  assert.equal(Math.min(...floor.uvs), 0);
  const s = analyze({ ...floor });
  assert.equal(s.nonManifold, 0);
  assert.equal(s.misoriented, 0);
  assert.ok(Math.abs(s.area - 256) < 1e-6);
});

console.log(`${passed} testes passaram`);
