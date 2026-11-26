const mipmapShader = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOutput {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.position = vec4f(corners[index], 0.0, 1.0);
  output.uv = vec2f(corners[index].x * 0.5 + 0.5, 0.5 - corners[index].y * 0.5);
  return output;
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(source, linearSampler, input.uv);
}
`;

const pipelineCache = new WeakMap();

function getMipmapResources(device, format) {
  let perDevice = pipelineCache.get(device);
  if (!perDevice) {
    perDevice = new Map();
    pipelineCache.set(device, perDevice);
  }
  let resources = perDevice.get(format);
  if (!resources) {
    const module = device.createShaderModule({ code: mipmapShader });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    resources = { pipeline, sampler };
    perDevice.set(format, resources);
  }
  return resources;
}

function generateMipmaps(device, texture) {
  const { pipeline, sampler } = getMipmapResources(device, texture.format);
  const encoder = device.createCommandEncoder();

  for (let level = 1; level < texture.mipLevelCount; level++) {
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
        { binding: 1, resource: sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  device.queue.submit([encoder.finish()]);
}

export async function loadFloorTexture(device, url, { mipmaps = true, srgb = false, maxAnisotropy = 16 } = {}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao carregar a textura: ${url} (${response.status})`);

  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none" });
  const { width, height } = bitmap;
  const mipLevelCount = mipmaps ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1;

  const texture = device.createTexture({
    size: [width, height],
    format: srgb ? "rgba8unorm-srgb" : "rgba8unorm",
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture({ source: bitmap, flipY: false }, { texture }, [width, height]);
  bitmap.close();

  if (mipLevelCount > 1) generateMipmaps(device, texture);

  const sampler = device.createSampler({
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: mipmaps ? "linear" : "nearest",
    maxAnisotropy: mipmaps ? maxAnisotropy : 1,
  });

  return { texture, view: texture.createView(), sampler };
}
