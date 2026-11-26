import tableVertShaderSrc from './illumination.vert.js';
import tableFragShaderSrc from './illumination.frag.js';
import floorVertShaderSrc from './floor.vert.js';
import floorFragShaderSrc from './floor.frag.js';
import WebGPU from './lib/webgpu.js';
import { createTableGeometry } from './table.js';
import { createFloorGeometry } from './floor.js';
import {
    createIdentityMat4,
    createLookAtMat4,
    createNormalMat4,
    createPerspectiveMat4,
    multiplyMat4,
} from './lib/utils.js';

class Mesh {
    constructor(gpu, program, geometry, buffers, createBindGroup) {
        this.program = program;
        this.shape = gpu.createShape({
            buffers: buffers.map((name) => geometry[name]),
            indices: geometry.indices,
            indexFormat: 'uint32',
            vertexCount: geometry.vertexCount,
        });
        this.uniform = {
            data: new Float32Array(84),
            buffer: gpu.createUniformBuffer(new Float32Array(84)),
        };
        this.bindGroup = createBindGroup(this.uniform.buffer);
    }

    updateUniform(model, view, projection, light) {
        const normalMatrix = createNormalMat4(multiplyMat4(view, model));

        this.uniform.data.set(model, 0);
        this.uniform.data.set(view, 16);
        this.uniform.data.set(projection, 32);
        this.uniform.data.set(normalMatrix, 48);
        this.uniform.data.set(light.position, 64);
        this.uniform.data.set(light.ambient, 68);
        this.uniform.data.set(light.diffuse, 72);
        this.uniform.data.set(light.specular, 76);
        this.uniform.data.set(light.params, 80);
    }

    draw(gpu, view, projection, light) {
        this.updateUniform(createIdentityMat4(), view, projection, light);
        gpu.writeBuffer(this.uniform.buffer, this.uniform.data);
        gpu.draw(this.program, this.shape, [this.bindGroup]);
    }
}

class Scene {
    constructor(gpu, floorTexture) {
        this.distance = 7;
        this.azimuth = 0.55;
        this.elevation = 0.45;
        this.target = [0, 0.9, 0];

        this.light = {
            position: [4, 6, 4, 1],
            ambient: [1, 1, 1, 0.25],
            diffuse: [1, 1, 1, 0.75],
            specular: [1, 1, 1, 0.2],
            params: [48, 0, 0, 0],
        };

        const tableProgram = gpu.createProgram(tableVertShaderSrc, tableFragShaderSrc, {
            cullMode: 'back',
            buffers: [0, 1, 2].map((shaderLocation) => ({
                arrayStride: 4 * 4,
                attributes: [{ shaderLocation, offset: 0, format: 'float32x4' }],
            })),
        });

        const floorProgram = gpu.createProgram(floorVertShaderSrc, floorFragShaderSrc, {
            cullMode: 'back',
            buffers: [
                {
                    arrayStride: 4 * 4,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }],
                },
                {
                    arrayStride: 2 * 4,
                    attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
                },
                {
                    arrayStride: 4 * 4,
                    attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }],
                },
            ],
        });

        const sampler = gpu.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
        });

        this.meshes = [
            new Mesh(
                gpu,
                tableProgram,
                createTableGeometry(),
                ['positions', 'colors', 'normals'],
                (buffer) => gpu.createBindGroup(tableProgram, [
                    { binding: 0, resource: { buffer } },
                ]),
            ),
            new Mesh(
                gpu,
                floorProgram,
                createFloorGeometry({ halfSize: 8, divisions: 1, repeat: 8 }),
                ['positions', 'uvs', 'normals'],
                (buffer) => gpu.createBindGroup(floorProgram, [
                    { binding: 0, resource: { buffer } },
                    { binding: 1, resource: sampler },
                    { binding: 2, resource: floorTexture.createView() },
                ]),
            ),
        ];
    }

    createViewMatrix() {
        const horizontal = this.distance * Math.cos(this.elevation);
        const eye = [
            this.target[0] + horizontal * Math.sin(this.azimuth),
            this.target[1] + this.distance * Math.sin(this.elevation),
            this.target[2] + horizontal * Math.cos(this.azimuth),
        ];

        return createLookAtMat4(eye, this.target, [0, 1, 0], true);
    }

    createProjectionMatrix() {
        const aspect = 1024 / 768;
        return createPerspectiveMat4(Math.PI / 4, aspect, 0.1, 100);
    }

    draw(gpu) {
        const view = this.createViewMatrix();
        const projection = this.createProjectionMatrix();

        for (const mesh of this.meshes) {
            mesh.draw(gpu, view, projection, this.light);
        }
    }
}

class Main {
    async init() {
        this.gpu = await WebGPU.createCanvas('#glcanvas', 1024, 768, {
            clearColor: { r: 0.2, g: 0.2, b: 0.22, a: 1 },
        });
        const texture = await this.gpu.createTextureFromImage(
            new URL('./assets/Tiles074_1K-JPG_Color.jpg', import.meta.url),
        );
        this.scene = new Scene(this.gpu, texture);

        this.gpu.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.scene.distance = Math.min(20, Math.max(3, this.scene.distance * Math.exp(event.deltaY * 0.001)));
        }, { passive: false });
    }

    draw() {
        this.gpu.start();
        this.scene.draw(this.gpu);
        this.gpu.finish();
        requestAnimationFrame(this.draw.bind(this));
    }
}

try {
    const app = new Main();
    await app.init();
    app.draw();
} catch (error) {
    console.error(error);
    document.body.insertAdjacentHTML('beforeend', `<p>${error.message}</p>`);
}
