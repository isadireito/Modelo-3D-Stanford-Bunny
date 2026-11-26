import { marchingCubes } from './marching-cubes.js';

export const TABLE_HEIGHT = 1.6;
export const TABLE_BOUNDS = { minX: -1.6, maxX: 1.6, minY: -0.2, maxY: 1.8, minZ: -1.6, maxZ: 1.6 };
export const TABLE_RESOLUTION = [128, 85, 128];

export function tableField(x, y, z) {
    const dy = y - 0.8;
    return Math.max(x * x + z * z - 0.36 - 2.5 * dy * dy, -y, y - TABLE_HEIGHT);
}

export function tableGradient(x, y, z) {
    const dy = y - 0.8;
    const side = x * x + z * z - 0.36 - 2.5 * dy * dy;
    const bottom = -y;
    const top = y - TABLE_HEIGHT;

    if (side >= bottom && side >= top) {
        return [2 * x, -5 * dy, 2 * z];
    }
    return top >= bottom ? [0, 1, 0] : [0, -1, 0];
}

export function createTableGeometry(color = [0.25, 0.45, 0.85, 1], resolution = TABLE_RESOLUTION) {
    const { positions, normals, indices, vertexCount } = marchingCubes(
        tableField,
        TABLE_BOUNDS,
        resolution,
        { isoLevel: 0, gradient: tableGradient },
    );

    const colors = new Float32Array(vertexCount * 4);
    for (let i = 0; i < vertexCount; i++) {
        colors.set(color, i * 4);
    }

    return { positions, colors, normals, indices, vertexCount };
}
