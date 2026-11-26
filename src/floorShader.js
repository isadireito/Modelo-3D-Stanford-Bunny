export function floorAlbedoWGSL({ group = 1, textureBinding = 0, samplerBinding = 1 } = {}) {
  return `
@group(${group}) @binding(${textureBinding}) var floorTexture: texture_2d<f32>;
@group(${group}) @binding(${samplerBinding}) var floorSampler: sampler;

fn sampleFloorAlbedo(uv: vec2f) -> vec3f {
  return textureSample(floorTexture, floorSampler, uv).rgb;
}
`;
}

export function floorBindGroupLayoutEntries({ textureBinding = 0, samplerBinding = 1 } = {}) {
  return [
    {
      binding: textureBinding,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "float", viewDimension: "2d" },
    },
    {
      binding: samplerBinding,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: "filtering" },
    },
  ];
}

export function createFloorBindGroup(device, layout, floorTexture, { textureBinding = 0, samplerBinding = 1 } = {}) {
  return device.createBindGroup({
    layout,
    entries: [
      { binding: textureBinding, resource: floorTexture.view },
      { binding: samplerBinding, resource: floorTexture.sampler },
    ],
  });
}
