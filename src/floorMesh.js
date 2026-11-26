export function createFloorMesh({ halfSize = 8, divisions = 1, repeat = 8, y = 0 } = {}) {
  const side = divisions + 1;
  const positions = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const indices = new Uint32Array(divisions * divisions * 6);

  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const vertex = row * side + col;
      const s = col / divisions;
      const t = row / divisions;
      positions.set([-halfSize + 2 * halfSize * s, y, -halfSize + 2 * halfSize * t], vertex * 3);
      normals.set([0, 1, 0], vertex * 3);
      uvs.set([repeat * s, repeat * t], vertex * 2);
    }
  }

  let cursor = 0;
  for (let row = 0; row < divisions; row++) {
    for (let col = 0; col < divisions; col++) {
      const a = row * side + col;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices.set([a, c, d, a, d, b], cursor);
      cursor += 6;
    }
  }

  return { positions, normals, uvs, indices };
}
