import { createTableMesh } from "../src/tableMesh.js";
import { createFloorMesh } from "../src/floorMesh.js";
import { loadFloorTexture } from "../src/floorTexture.js";
import { floorAlbedoWGSL, floorBindGroupLayoutEntries, createFloorBindGroup } from "../src/floorShader.js";
import { perspective, lookAt, multiply } from "./viewerMath.js";

const TEXTURE_URL = "../assets/Tiles074_1K-JPG_Color.jpg";
const TABLE_COLOR = [0.25, 0.45, 0.85, 1];
const TARGET = [0, 0.9, 0];

const shader = `
struct Frame {
  viewProj: mat4x4f,
  lightA: vec4f,
  lightB: vec4f,
  eye: vec4f,
}

struct Material {
  color: vec4f,
}

@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(2) var<uniform> material: Material;
${floorAlbedoWGSL({ group: 1, textureBinding: 0, samplerBinding: 1 })}

struct SolidVertex {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
}

struct FloorVertex {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

fn lightContribution(lightPosition: vec3f, albedo: vec3f, world: vec3f, n: vec3f, v: vec3f) -> vec3f {
  let l = normalize(lightPosition - world);
  let diffuse = max(dot(n, l), 0.0);
  let r = reflect(-l, n);
  let specular = select(0.0, pow(max(dot(r, v), 0.0), 32.0), diffuse > 0.0);
  return albedo * diffuse * 0.55 + vec3f(0.12) * specular;
}

fn shade(albedo: vec3f, world: vec3f, normal: vec3f) -> vec3f {
  let n = normalize(normal);
  let v = normalize(frame.eye.xyz - world);
  var color = albedo * 0.2;
  color += lightContribution(frame.lightA.xyz, albedo, world, n, v);
  color += lightContribution(frame.lightB.xyz, albedo, world, n, v);
  return color;
}

@vertex
fn vsSolid(@location(0) position: vec3f, @location(1) normal: vec3f) -> SolidVertex {
  var output: SolidVertex;
  output.clip = frame.viewProj * vec4f(position, 1.0);
  output.world = position;
  output.normal = normal;
  return output;
}

@vertex
fn vsFloor(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> FloorVertex {
  var output: FloorVertex;
  output.clip = frame.viewProj * vec4f(position, 1.0);
  output.world = position;
  output.normal = normal;
  output.uv = uv;
  return output;
}

@fragment
fn fsSolid(input: SolidVertex) -> @location(0) vec4f {
  return vec4f(shade(material.color.rgb, input.world, input.normal), 1.0);
}

@fragment
fn fsFloor(input: FloorVertex) -> @location(0) vec4f {
  return vec4f(shade(sampleFloorAlbedo(input.uv), input.world, input.normal), 1.0);
}
`;

function createBuffer(device, data, usage) {
  const buffer = device.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function createMeshBuffers(device, mesh) {
  return {
    positions: createBuffer(device, mesh.positions, GPUBufferUsage.VERTEX),
    normals: createBuffer(device, mesh.normals, GPUBufferUsage.VERTEX),
    uvs: mesh.uvs ? createBuffer(device, mesh.uvs, GPUBufferUsage.VERTEX) : null,
    indices: createBuffer(device, mesh.indices, GPUBufferUsage.INDEX),
    indexCount: mesh.indices.length,
  };
}

async function main() {
  if (!navigator.gpu) throw new Error("WebGPU não suportado");
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const canvas = document.getElementById("canvas");
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const module = device.createShaderModule({ code: shader });
  const vec3Layout = (location) => ({ arrayStride: 12, attributes: [{ shaderLocation: location, offset: 0, format: "float32x3" }] });
  const uvLayout = { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] };
  const primitive = { topology: "triangle-list", cullMode: "back", frontFace: "ccw" };
  const depthStencil = { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" };

  const solidPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vsSolid", buffers: [vec3Layout(0), vec3Layout(1)] },
    fragment: { module, entryPoint: "fsSolid", targets: [{ format }] },
    primitive,
    depthStencil,
  });

  const floorMaterialLayout = device.createBindGroupLayout({ entries: floorBindGroupLayoutEntries() });
  const frameLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
  });

  const floorPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, floorMaterialLayout] }),
    vertex: { module, entryPoint: "vsFloor", buffers: [vec3Layout(0), vec3Layout(1), uvLayout] },
    fragment: { module, entryPoint: "fsFloor", targets: [{ format }] },
    primitive,
    depthStencil,
  });

  const table = createMeshBuffers(device, createTableMesh());
  const floor = createMeshBuffers(device, createFloorMesh({ halfSize: 8, divisions: 1, repeat: 8 }));
  const floorTexture = await loadFloorTexture(device, TEXTURE_URL);

  const frameBuffer = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const materialBuffer = createBuffer(device, new Float32Array(TABLE_COLOR), GPUBufferUsage.UNIFORM);

  const solidFrameBindGroup = device.createBindGroup({ layout: solidPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: frameBuffer } }] });
  const floorFrameBindGroup = device.createBindGroup({ layout: frameLayout, entries: [{ binding: 0, resource: { buffer: frameBuffer } }] });
  const materialBindGroup = device.createBindGroup({ layout: solidPipeline.getBindGroupLayout(1), entries: [{ binding: 2, resource: { buffer: materialBuffer } }] });
  const floorBindGroup = createFloorBindGroup(device, floorMaterialLayout, floorTexture);

  const camera = { distance: 7, azimuth: 0.55, elevation: 0.45 };
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.distance = Math.min(20, Math.max(3, camera.distance * Math.exp(event.deltaY * 0.001)));
  }, { passive: false });

  let dragging = false;
  canvas.addEventListener("pointerdown", () => { dragging = true; });
  window.addEventListener("pointerup", () => { dragging = false; });
  window.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    camera.azimuth -= event.movementX * 0.005;
    camera.elevation = Math.min(1.4, Math.max(0.05, camera.elevation + event.movementY * 0.005));
  });

  let depthTexture = null;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width === width && canvas.height === height && depthTexture) return;
    canvas.width = width;
    canvas.height = height;
    if (depthTexture) depthTexture.destroy();
    depthTexture = device.createTexture({ size: [width, height], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  const frameData = new Float32Array(28);

  function frame() {
    resize();
    const cosE = Math.cos(camera.elevation);
    const eye = [
      TARGET[0] + camera.distance * cosE * Math.sin(camera.azimuth),
      TARGET[1] + camera.distance * Math.sin(camera.elevation),
      TARGET[2] + camera.distance * cosE * Math.cos(camera.azimuth),
    ];
    const view = lookAt(eye, TARGET, [0, 1, 0]);
    const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
    frameData.set(multiply(projection, view), 0);
    frameData.set([4, 6, 4, 1], 16);
    frameData.set([-5, 4, 3, 1], 20);
    frameData.set([eye[0], eye[1], eye[2], 1], 24);
    device.queue.writeBuffer(frameBuffer, 0, frameData);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.2, g: 0.2, b: 0.22, a: 1 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depthTexture.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });

    pass.setPipeline(solidPipeline);
    pass.setBindGroup(0, solidFrameBindGroup);
    pass.setBindGroup(1, materialBindGroup);
    pass.setVertexBuffer(0, table.positions);
    pass.setVertexBuffer(1, table.normals);
    pass.setIndexBuffer(table.indices, "uint32");
    pass.drawIndexed(table.indexCount);

    pass.setPipeline(floorPipeline);
    pass.setBindGroup(0, floorFrameBindGroup);
    pass.setBindGroup(1, floorBindGroup);
    pass.setVertexBuffer(0, floor.positions);
    pass.setVertexBuffer(1, floor.normals);
    pass.setVertexBuffer(2, floor.uvs);
    pass.setIndexBuffer(floor.indices, "uint32");
    pass.drawIndexed(floor.indexCount);

    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  document.body.textContent = error.message;
  console.error(error);
});
