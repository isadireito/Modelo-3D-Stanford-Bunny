export const TABLE_HEIGHT = 1.6;

export const TABLE_BOUNDS = Object.freeze({
  min: Object.freeze([-1.6, -0.2, -1.6]),
  max: Object.freeze([1.6, 1.8, 1.6]),
});

export const TABLE_RESOLUTION = Object.freeze([128, 85, 128]);

export function tableField(x, y, z) {
  const dy = y - 0.8;
  const side = x * x + z * z - 0.36 - 2.5 * dy * dy;
  return Math.max(side, -y, y - TABLE_HEIGHT);
}

export function tableGradient(x, y, z) {
  const dy = y - 0.8;
  const side = x * x + z * z - 0.36 - 2.5 * dy * dy;
  const bottom = -y;
  const top = y - TABLE_HEIGHT;
  if (side >= bottom && side >= top) return [2 * x, -5 * dy, 2 * z];
  if (top >= bottom) return [0, 1, 0];
  return [0, -1, 0];
}
