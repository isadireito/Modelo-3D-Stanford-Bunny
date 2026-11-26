import { marchingCubes } from "./marchingCubes.js";
import { TABLE_BOUNDS, TABLE_RESOLUTION, tableField, tableGradient } from "./implicit.js";

export function createTableMesh({ resolution = TABLE_RESOLUTION } = {}) {
  return marchingCubes({
    field: tableField,
    gradient: tableGradient,
    min: TABLE_BOUNDS.min,
    max: TABLE_BOUNDS.max,
    resolution,
    isoLevel: 0,
  });
}
