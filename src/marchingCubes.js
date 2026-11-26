import { EDGE_TABLE, TRI_TABLE, EDGE_CORNERS, CORNER_OFFSETS } from "./marchingCubesTables.js";

const EDGES = EDGE_CORNERS.map(([a, b]) => {
  const oa = CORNER_OFFSETS[a];
  const ob = CORNER_OFFSETS[b];
  const axis = oa[0] !== ob[0] ? 0 : oa[1] !== ob[1] ? 1 : 2;
  const base = oa[axis] < ob[axis] ? oa : ob;
  return { a, b, axis, base };
});

export function marchingCubes({ field, gradient, min, max, resolution, isoLevel = 0 }) {
  const [nx, ny, nz] = resolution;
  const sx = nx + 1;
  const sy = ny + 1;
  const sz = nz + 1;
  const dx = (max[0] - min[0]) / nx;
  const dy = (max[1] - min[1]) / ny;
  const dz = (max[2] - min[2]) / nz;
  const gridIndex = (i, j, k) => i + sx * (j + sy * k);

  const values = new Float64Array(sx * sy * sz);
  for (let k = 0; k < sz; k++) {
    const z = min[2] + k * dz;
    for (let j = 0; j < sy; j++) {
      const y = min[1] + j * dy;
      for (let i = 0; i < sx; i++) {
        values[gridIndex(i, j, k)] = field(min[0] + i * dx, y, z);
      }
    }
  }

  const edgeVertices = new Int32Array(values.length * 3).fill(-1);
  const positions = [];
  const normals = [];
  const indices = [];
  const cornerValues = new Float64Array(8);
  const cellVertices = new Int32Array(12);

  function edgeVertex(i, j, k, edge) {
    const key = gridIndex(i + edge.base[0], j + edge.base[1], k + edge.base[2]) * 3 + edge.axis;
    const cached = edgeVertices[key];
    if (cached >= 0) return cached;

    const oa = CORNER_OFFSETS[edge.a];
    const ob = CORNER_OFFSETS[edge.b];
    const va = cornerValues[edge.a];
    const vb = cornerValues[edge.b];
    const delta = vb - va;
    const t = Math.abs(delta) < 1e-14 ? 0.5 : (isoLevel - va) / delta;

    const px = min[0] + (i + oa[0] + t * (ob[0] - oa[0])) * dx;
    const py = min[1] + (j + oa[1] + t * (ob[1] - oa[1])) * dy;
    const pz = min[2] + (k + oa[2] + t * (ob[2] - oa[2])) * dz;

    const g = gradient(px, py, pz);
    const length = Math.hypot(g[0], g[1], g[2]);
    const inv = length > 1e-12 ? 1 / length : 0;

    const index = positions.length / 3;
    positions.push(px, py, pz);
    if (inv === 0) normals.push(0, 1, 0);
    else normals.push(g[0] * inv, g[1] * inv, g[2] * inv);

    edgeVertices[key] = index;
    return index;
  }

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let caseIndex = 0;
        for (let c = 0; c < 8; c++) {
          const o = CORNER_OFFSETS[c];
          const value = values[gridIndex(i + o[0], j + o[1], k + o[2])];
          cornerValues[c] = value;
          if (value < isoLevel) caseIndex |= 1 << c;
        }

        const edgeMask = EDGE_TABLE[caseIndex];
        if (edgeMask === 0) continue;

        for (let e = 0; e < 12; e++) {
          if (edgeMask & (1 << e)) cellVertices[e] = edgeVertex(i, j, k, EDGES[e]);
        }

        const row = caseIndex * 16;
        for (let n = 0; TRI_TABLE[row + n] !== -1; n += 3) {
          indices.push(
            cellVertices[TRI_TABLE[row + n]],
            cellVertices[TRI_TABLE[row + n + 2]],
            cellVertices[TRI_TABLE[row + n + 1]],
          );
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}
