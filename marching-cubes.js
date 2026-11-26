import { EDGE_TABLE, TRI_TABLE, EDGE_CORNERS, CORNER_OFFSETS } from './marching-cubes-tables.js';

const edges = EDGE_CORNERS.map(([a, b]) => {
    const offsetA = CORNER_OFFSETS[a];
    const offsetB = CORNER_OFFSETS[b];
    const axis = offsetA[0] !== offsetB[0] ? 0 : offsetA[1] !== offsetB[1] ? 1 : 2;
    const base = offsetA[axis] < offsetB[axis] ? offsetA : offsetB;
    return { a, b, axis, base };
});

function createNumericalGradient(field, step) {
    return (x, y, z) => [
        field(x + step, y, z) - field(x - step, y, z),
        field(x, y + step, z) - field(x, y - step, z),
        field(x, y, z + step) - field(x, y, z - step),
    ];
}

export function marchingCubes(field, bounds = {}, resolution = 64, options = {}) {
    const { minX = -2, maxX = 2, minY = -2, maxY = 2, minZ = -2, maxZ = 2 } = bounds;
    const [columns, rows, layers] = Array.isArray(resolution)
        ? resolution
        : [resolution, resolution, resolution];
    const { isoLevel = 0, gradient } = options;

    if (typeof field !== 'function') {
        throw new TypeError('The implicit field must be a function.');
    }
    if (![minX, maxX, minY, maxY, minZ, maxZ].every(Number.isFinite)
        || minX >= maxX || minY >= maxY || minZ >= maxZ) {
        throw new RangeError('Bounds must be finite and strictly increasing.');
    }
    if (![columns, rows, layers].every((value) => Number.isSafeInteger(value) && value > 0)) {
        throw new RangeError('Grid resolution must contain positive integers.');
    }

    const dx = (maxX - minX) / columns;
    const dy = (maxY - minY) / rows;
    const dz = (maxZ - minZ) / layers;
    const strideX = columns + 1;
    const strideY = rows + 1;
    const samples = new Float64Array(strideX * strideY * (layers + 1));
    const gridIndex = (i, j, k) => i + strideX * (j + strideY * k);
    const normalAt = gradient ?? createNumericalGradient(field, 0.5 * Math.min(dx, dy, dz));

    for (let k = 0; k <= layers; k++) {
        for (let j = 0; j <= rows; j++) {
            for (let i = 0; i <= columns; i++) {
                const value = field(minX + i * dx, minY + j * dy, minZ + k * dz);
                if (!Number.isFinite(value)) {
                    throw new RangeError('The implicit field must return finite numbers at every grid vertex.');
                }
                samples[gridIndex(i, j, k)] = value;
            }
        }
    }

    const vertexOfEdge = new Int32Array(samples.length * 3).fill(-1);
    const positions = [];
    const normals = [];
    const indices = [];
    const values = new Float64Array(8);
    const cellVertices = new Int32Array(12);

    const getVertex = (i, j, k, edge) => {
        const key = 3 * gridIndex(i + edge.base[0], j + edge.base[1], k + edge.base[2]) + edge.axis;
        if (vertexOfEdge[key] >= 0) {
            return vertexOfEdge[key];
        }

        const cornerA = CORNER_OFFSETS[edge.a];
        const cornerB = CORNER_OFFSETS[edge.b];
        const difference = values[edge.b] - values[edge.a];
        const t = Math.abs(difference) < 1e-14 ? 0.5 : (isoLevel - values[edge.a]) / difference;

        const x = minX + (i + cornerA[0] + t * (cornerB[0] - cornerA[0])) * dx;
        const y = minY + (j + cornerA[1] + t * (cornerB[1] - cornerA[1])) * dy;
        const z = minZ + (k + cornerA[2] + t * (cornerB[2] - cornerA[2])) * dz;

        const [gx, gy, gz] = normalAt(x, y, z);
        const length = Math.hypot(gx, gy, gz);

        const vertex = positions.length / 4;
        positions.push(x, y, z, 1);
        if (length > 1e-12) {
            normals.push(gx / length, gy / length, gz / length, 0);
        } else {
            normals.push(0, 1, 0, 0);
        }

        vertexOfEdge[key] = vertex;
        return vertex;
    };

    for (let k = 0; k < layers; k++) {
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < columns; i++) {
                let mask = 0;
                for (let corner = 0; corner < 8; corner++) {
                    const offset = CORNER_OFFSETS[corner];
                    values[corner] = samples[gridIndex(i + offset[0], j + offset[1], k + offset[2])];
                    if (values[corner] < isoLevel) {
                        mask |= 1 << corner;
                    }
                }

                const crossed = EDGE_TABLE[mask];
                if (crossed === 0) {
                    continue;
                }

                for (let e = 0; e < 12; e++) {
                    if (crossed & (1 << e)) {
                        cellVertices[e] = getVertex(i, j, k, edges[e]);
                    }
                }

                const row = mask * 16;
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
        vertexCount: positions.length / 4,
    };
}
