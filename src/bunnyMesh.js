import { parsePLY } from './plyParser.js';
import { HalfEdgeDS } from '../lib/half-edge.js';

const TABLE_TOP_Y = 1.6;
const TARGET_HORIZONTAL_SIZE = 1.8; 

export async function loadBunny(plyUrl = '../assets/bun_zipper.ply') {
    
  const res = await fetch(plyUrl);
  const buffer = await res.arrayBuffer();


  const { positions, indices } = parsePLY(buffer);

  const ds = new HalfEdgeDS();
  ds.build(positions, indices);

  const bbox = ds.computeBoundingBox();
  const mesh = ds.getMeshData();

  const maxHoriz = Math.max(bbox.size[0], bbox.size[2]);
  const scale = TARGET_HORIZONTAL_SIZE / maxHoriz;

  const tx = -bbox.center[0] * scale;
  const ty = TABLE_TOP_Y - bbox.min[1] * scale;
  const tz = -bbox.center[2] * scale;

  const modelMatrix = new Float32Array([
    scale, 0,     0,     0,
    0,     scale, 0,     0,
    0,     0,     scale, 0,
    tx,    ty,    tz,    1,
  ]);

  return {
    mesh,     
    modelMatrix, 
    bbox,
    scale,
    stats: {
      vertexCount: ds.vertices.length,
      faceCount: ds.faces.length,
      halfEdgeCount: ds.halfEdges.length,
      boundaryHalfEdges: ds.halfEdges.filter(he => he.opposite === null).length,
    }
  };
}