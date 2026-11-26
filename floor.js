export function createFloorGeometry({ halfSize = 8, divisions = 1, repeat = 8, y = 0 } = {}) {
    const side = divisions + 1;
    const positions = [];
    const uvs = [];
    const normals = [];
    const indices = [];

    for (let row = 0; row < side; row++) {
        for (let col = 0; col < side; col++) {
            const s = col / divisions;
            const t = row / divisions;
            positions.push(-halfSize + 2 * halfSize * s, y, -halfSize + 2 * halfSize * t, 1);
            uvs.push(repeat * s, repeat * t);
            normals.push(0, 1, 0, 0);
        }
    }

    for (let row = 0; row < divisions; row++) {
        for (let col = 0; col < divisions; col++) {
            const a = row * side + col;
            const b = a + 1;
            const c = a + side;
            const d = c + 1;
            indices.push(a, c, d, a, d, b);
        }
    }

    return {
        positions: new Float32Array(positions),
        uvs: new Float32Array(uvs),
        normals: new Float32Array(normals),
        indices: new Uint32Array(indices),
        vertexCount: positions.length / 4,
    };
}
