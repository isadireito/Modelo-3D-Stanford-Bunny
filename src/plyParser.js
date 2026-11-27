export function parsePLY(buffer) {
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  function readLine() {
    let line = '';
    while (offset < bytes.length && bytes[offset] !== 10) {
      line += String.fromCharCode(bytes[offset]);
      offset++;
    }
    offset++; 
    return line;
  }

  let format = null;
  let vertexCount = 0;
  let faceCount = 0;
  const vertexProps = [];
  let inVertexElement = false;

  while (true) {
    const line = readLine().trim();
    if (line === 'end_header') break;

    if (line.startsWith('format ')) {
      format = line.split(/\s+/)[1];
    } else if (line.startsWith('element vertex ')) {
      vertexCount = parseInt(line.split(/\s+/)[2], 10);
      inVertexElement = true;
    } else if (line.startsWith('element face ')) {
      faceCount = parseInt(line.split(/\s+/)[2], 10);
      inVertexElement = false;
    } else if (line.startsWith('property ') && inVertexElement) {
      const [, type, name] = line.split(/\s+/);
      vertexProps.push({ type, name });
    }
  }

  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(faceCount * 3);


  if (format === 'ascii') {
    for (let i = 0; i < vertexCount; i++) {
      const line = readLine().trim();
      const parts = line.split(/\s+/);
      positions[i * 3]     = parseFloat(parts[0]);
      positions[i * 3 + 1] = parseFloat(parts[1]);
      positions[i * 3 + 2] = parseFloat(parts[2]);
    }
    for (let i = 0; i < faceCount; i++) {
      const line = readLine().trim();
      const parts = line.split(/\s+/);
      indices[i * 3]     = parseInt(parts[1], 10);
      indices[i * 3 + 1] = parseInt(parts[2], 10);
      indices[i * 3 + 2] = parseInt(parts[3], 10);
    }
  } 

  else if (format === 'binary_little_endian') {
    const typeSize = { float: 4, float32: 4, double: 8, uchar: 1, int: 4, uint: 4 };
    const propOffset = {};
    let vertexStride = 0;
    for (const p of vertexProps) {
      propOffset[p.name] = vertexStride;
      vertexStride += typeSize[p.type] ?? 4;
    }

    const dv = new DataView(buffer);
    for (let i = 0; i < vertexCount; i++) {
      const base = offset + i * vertexStride;
      positions[i * 3]     = dv.getFloat32(base + propOffset.x, true);
      positions[i * 3 + 1] = dv.getFloat32(base + propOffset.y, true);
      positions[i * 3 + 2] = dv.getFloat32(base + propOffset.z, true);
    }
    offset += vertexCount * vertexStride;

    for (let i = 0; i < faceCount; i++) {
      const n = bytes[offset]; offset += 1;
      if (n !== 3) throw new Error(`Face não triangular: ${n} vértices`);
      indices[i * 3]     = dv.getUint32(offset, true); offset += 4;
      indices[i * 3 + 1] = dv.getUint32(offset, true); offset += 4;
      indices[i * 3 + 2] = dv.getUint32(offset, true); offset += 4;
    }
  } else {
    throw new Error(`Formato PLY não suportado: ${format}`);
  }

  return { positions, indices };
}