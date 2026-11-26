import assert from 'node:assert/strict';
import { marchingCubes } from './marching-cubes.js';
import { EDGE_TABLE, TRI_TABLE, EDGE_CORNERS } from './marching-cubes-tables.js';
import { createTableGeometry, tableField, TABLE_BOUNDS, TABLE_RESOLUTION } from './table.js';
import { createFloorGeometry } from './floor.js';

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log(`ok - ${name}`);
}

function analyze({ positions, normals, indices, vertexCount }) {
    const faceCount = indices.length / 3;
    const directed = new Map();
    for (let f = 0; f < faceCount; f++) {
        for (let e = 0; e < 3; e++) {
            const key = indices[f * 3 + e] * vertexCount + indices[f * 3 + ((e + 1) % 3)];
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
        const ids = [indices[f * 3] * 4, indices[f * 3 + 1] * 4, indices[f * 3 + 2] * 4];
        const [p0, p1, p2] = ids.map((i) => positions.subarray(i, i + 3));
        const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...n);
        area += length / 2;
        volume += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1])
            - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0])
            + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;

        if (length > 1e-12) {
            const sum = [0, 0, 0];
            for (const i of ids) for (let c = 0; c < 3; c++) sum[c] += normals[i + c];
            if (n[0] * sum[0] + n[1] * sum[1] + n[2] * sum[2] <= 0) {
                misoriented++;
                misorientedY.push((p0[1] + p1[1] + p2[1]) / 3);
            }
        }
    }

    const edgeCount = directed.size / 2;
    return {
        vertexCount,
        faceCount,
        euler: vertexCount - edgeCount + faceCount,
        nonManifold,
        unpaired,
        area,
        volume,
        misoriented,
        misorientedY,
    };
}

test('tables: edge table agrees with triangle table and corner signs', () => {
    for (let c = 0; c < 256; c++) {
        let used = 0;
        for (let n = 0; TRI_TABLE[c * 16 + n] !== -1; n++) used |= 1 << TRI_TABLE[c * 16 + n];
        let cut = 0;
        for (let e = 0; e < 12; e++) {
            const [a, b] = EDGE_CORNERS[e];
            if (((c >> a) & 1) !== ((c >> b) & 1)) cut |= 1 << e;
        }
        assert.equal(used, EDGE_TABLE[c], `case ${c}`);
        assert.equal(cut, EDGE_TABLE[c], `case ${c}`);
    }
});

test('sphere: on the surface, closed, outward oriented, default gradient', () => {
    const geometry = marchingCubes(
        (x, y, z) => Math.hypot(x, y, z) - 1,
        { minX: -1.5, maxX: 1.5, minY: -1.5, maxY: 1.5, minZ: -1.5, maxZ: 1.5 },
        48,
    );
    for (let i = 0; i < geometry.positions.length; i += 4) {
        const r = Math.hypot(geometry.positions[i], geometry.positions[i + 1], geometry.positions[i + 2]);
        assert.ok(Math.abs(r - 1) < 2e-3);
        assert.equal(geometry.positions[i + 3], 1);
        assert.equal(geometry.normals[i + 3], 0);
    }
    const s = analyze(geometry);
    assert.equal(s.nonManifold, 0);
    assert.equal(s.unpaired, 0);
    assert.equal(s.euler, 2);
    assert.equal(s.misoriented, 0);
    assert.ok(Math.abs(s.area - 4 * Math.PI) / (4 * Math.PI) < 0.01);
    assert.ok(Math.abs(s.volume - (4 / 3) * Math.PI) / ((4 / 3) * Math.PI) < 0.01);
});

test('table: closed surface of genus zero, outward oriented', () => {
    const geometry = createTableGeometry();
    const s = analyze(geometry);
    console.log(`   resolution ${TABLE_RESOLUTION.join('x')}: ${s.vertexCount} vertices, ${s.faceCount} triangles`);
    assert.equal(s.nonManifold, 0);
    assert.equal(s.unpaired, 0);
    assert.equal(s.euler, 2);
    assert.ok(s.volume > 0);
    assert.equal(s.misorientedY.filter((y) => Math.abs(y) > 0.05 && Math.abs(y - 1.6) > 0.05).length, 0);
    assert.ok(s.misoriented / s.faceCount < 0.02);
});

test('table: dimensions match the implicit function', () => {
    const { positions: p } = createTableGeometry();
    let minY = Infinity;
    let maxY = -Infinity;
    let maxRadius = 0;
    let waist = Infinity;
    const residuals = [];
    for (let i = 0; i < p.length; i += 4) {
        minY = Math.min(minY, p[i + 1]);
        maxY = Math.max(maxY, p[i + 1]);
        const r = Math.hypot(p[i], p[i + 2]);
        maxRadius = Math.max(maxRadius, r);
        if (Math.abs(p[i + 1] - 0.8) < 0.02) waist = Math.min(waist, r);
        residuals.push(Math.abs(tableField(p[i], p[i + 1], p[i + 2])));
        assert.ok(p[i] >= TABLE_BOUNDS.minX && p[i] <= TABLE_BOUNDS.maxX);
        assert.ok(p[i + 1] >= TABLE_BOUNDS.minY && p[i + 1] <= TABLE_BOUNDS.maxY);
        assert.ok(p[i + 2] >= TABLE_BOUNDS.minZ && p[i + 2] <= TABLE_BOUNDS.maxZ);
    }
    residuals.sort((a, b) => a - b);
    assert.ok(Math.abs(minY) < 1e-5);
    assert.ok(Math.abs(maxY - 1.6) < 1e-5);
    assert.ok(Math.abs(maxRadius - 1.4) < 0.025);
    assert.ok(Math.abs(waist - 0.6) < 5e-3);
    assert.ok(residuals[Math.floor(residuals.length / 2)] < 5e-4);
    assert.ok(residuals[residuals.length - 1] < 0.03);
});

test('table: volume close to the analytic value', () => {
    const s = analyze(createTableGeometry());
    const volume = Math.PI * (0.36 * 1.6 + 2.5 * (2 * 0.8 ** 3) / 3);
    assert.ok(Math.abs(s.volume - volume) / volume < 0.005);
});

test('table: unit normals, flat top and bottom, solid color attribute', () => {
    const color = [0.25, 0.45, 0.85, 1];
    const { positions: p, normals: n, colors } = createTableGeometry(color);
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < n.length; i += 4) {
        assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-5);
        assert.equal(n[i + 3], 0);
        assert.deepEqual(Array.from(colors.subarray(i, i + 4)), color.map(Math.fround));
        if (Math.abs(p[i + 1] - 1.6) < 1e-5 && n[i + 1] > 0.999) top++;
        if (Math.abs(p[i + 1]) < 1e-5 && n[i + 1] < -0.999) bottom++;
    }
    assert.ok(top > 1000 && bottom > 1000);
});

test('floor: uv range, normals and counter-clockwise orientation', () => {
    const floor = createFloorGeometry({ halfSize: 8, divisions: 4, repeat: 8 });
    assert.equal(floor.vertexCount, 25);
    assert.equal(floor.positions.length, 25 * 4);
    assert.equal(floor.uvs.length, 25 * 2);
    assert.equal(floor.indices.length / 3, 32);
    assert.equal(Math.max(...floor.uvs), 8);
    assert.equal(Math.min(...floor.uvs), 0);
    const s = analyze(floor);
    assert.equal(s.nonManifold, 0);
    assert.equal(s.misoriented, 0);
    assert.ok(Math.abs(s.area - 256) < 1e-6);
});

console.log(`${passed} tests passed`);
