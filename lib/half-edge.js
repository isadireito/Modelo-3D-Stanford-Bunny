export class Vertex {
  constructor(vid, x, y, z) {
    this.vid = vid;
    this.position = [x, y, z];
    this.normal = [0, 1, 0];
    this.he = null; 
  }
}

export class HalfEdge {
  constructor(vertex) {
    this.vertex = vertex;   
    this.next = null;  
    this.face = null;    
    this.opposite = null;
  }
}

export class Face {
  constructor(baseHe) {
    this.baseHe = baseHe;
    this.normal = [0, 0, 0];
  }
}

export class HalfEdgeDS {
  constructor() {
    this.vertices = [];
    this.halfEdges = [];
    this.faces = [];
  }

  build(coords, trigs) {
    this.vertices = [];
    this.halfEdges = [];
    this.faces = [];

    for (let i = 0; i < coords.length; i += 3) {
      this.vertices.push(new Vertex(i / 3, coords[i], coords[i + 1], coords[i + 2]));
    }


    for (let i = 0; i < trigs.length; i += 3) {
      const v0 = this.vertices[trigs[i]];
      const v1 = this.vertices[trigs[i + 1]];
      const v2 = this.vertices[trigs[i + 2]];

      const he0 = new HalfEdge(v0);
      const he1 = new HalfEdge(v1);
      const he2 = new HalfEdge(v2);

      const face = new Face(he0);
      this.faces.push(face);

      he0.face = he1.face = he2.face = face;
      he0.next = he1; he1.next = he2; he2.next = he0;

      this.halfEdges.push(he0, he1, he2);
    }

    this._buildOpposites();
    this._assignVertexHe();
    this._computeFaceNormals();
    this._computeVertexNormalsByTraversal();
  }

  _buildOpposites() {
    const pending = new Map();
    for (const he of this.halfEdges) {
      const a = he.vertex.vid;
      const b = he.next.vertex.vid;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (pending.has(key)) {
        const other = pending.get(key);
        he.opposite = other;
        other.opposite = he;
        pending.delete(key);
      } else {
        pending.set(key, he);
      }
    }
  }

  _assignVertexHe() {
    for (const he of this.halfEdges) {
      const v = he.vertex;
      if (!v.he || he.opposite === null) {
        v.he = he;
      }
    }
  }

  _computeFaceNormals() {
    for (const face of this.faces) {
      const he0 = face.baseHe;
      const he1 = he0.next;
      const he2 = he1.next;
      const [x0, y0, z0] = he0.vertex.position;
      const [x1, y1, z1] = he1.vertex.position;
      const [x2, y2, z2] = he2.vertex.position;

      const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
      const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;

      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;

      const len = Math.hypot(nx, ny, nz) || 1;
      face.normal = [nx / len, ny / len, nz / len];
    }
  }

  _computeVertexNormalsByTraversal() {
    for (const v of this.vertices) {
      let sx = 0, sy = 0, sz = 0;

      if (v.he) {
        let he = v.he;
        const start = he;
        let guard = 0;
        const maxIter = this.halfEdges.length;

        do {
          if (he.face) {
            const [fx, fy, fz] = he.face.normal;
            sx += fx; sy += fy; sz += fz;
          }
          if (he.opposite) {
            he = he.opposite.next;
          } else {
            break;
          }

          if (++guard > maxIter) break;
        } while (he !== start);
      }

      const len = Math.hypot(sx, sy, sz);
      if (len > 1e-12) {
        v.normal = [sx / len, sy / len, sz / len];
      } else {
        v.normal = [0, 1, 0];
      }
    }
  }

  computeBoundingBox() {
    let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const v of this.vertices) {
      const [x, y, z] = v.position;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      size: [maxX - minX, maxY - minY, maxZ - minZ],
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    };
  }

  getMeshData() {
    const n = this.vertices.length;
    const positions = new Float32Array(n * 3);
    const normals   = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const v = this.vertices[i];
      positions[i * 3]     = v.position[0];
      positions[i * 3 + 1] = v.position[1];
      positions[i * 3 + 2] = v.position[2];
      normals[i * 3]       = v.normal[0];
      normals[i * 3 + 1]   = v.normal[1];
      normals[i * 3 + 2]   = v.normal[2];
    }

    const indices = new Uint32Array(this.faces.length * 3);
    for (let i = 0; i < this.faces.length; i++) {
      const he = this.faces[i].baseHe;
      indices[i * 3]     = he.vertex.vid;
      indices[i * 3 + 1] = he.next.vertex.vid;
      indices[i * 3 + 2] = he.next.next.vertex.vid;
    }

    return { positions, normals, indices };
  }
}