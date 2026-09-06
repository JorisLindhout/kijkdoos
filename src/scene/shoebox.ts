/** World units are meters. The block person is about 1.7 m tall. */
export const CEILING_SHORT_M = 2.4;
export const DEPTH_FACTOR = 0.85;
export const VERTICAL_FOV_DEG = 55;

export type ShoeboxMetrics = {
  width: number;
  height: number;
  depth: number;
  aspect: number;
  camDist: number;
  fovDeg: number;
};

/**
 * Ceiling stays 2.4 m. Wide screens grow the room width so the opening still
 * fills the viewport. Tall screens keep a 2.4 m square opening; extra viewport
 * height crops the left and right walls instead of stretching the ceiling.
 */
export function computeShoebox(viewWidth: number, viewHeight: number): ShoeboxMetrics {
  const aspect = Math.max(viewWidth, 1) / Math.max(viewHeight, 1);
  const short = CEILING_SHORT_M;
  const width = short * Math.max(aspect, 1);
  const height = short;
  const depth = DEPTH_FACTOR * Math.min(width, height);
  const fovDeg = VERTICAL_FOV_DEG;
  const fovRad = (fovDeg * Math.PI) / 180;
  const camDist = height / 2 / Math.tan(fovRad / 2);
  return { width, height, depth, aspect, camDist, fovDeg };
}

/** Floor UV: u = 0 left wall, 1 right wall; v = 0 opening, 1 back wall. */
export function floorPoint(
  metrics: ShoeboxMetrics,
  u: number,
  v: number,
): [number, number, number] {
  return [u * metrics.width, 0, -v * metrics.depth];
}

export function floorUV(
  metrics: ShoeboxMetrics,
  x: number,
  z: number,
): { u: number; v: number } {
  return {
    u: x / Math.max(metrics.width, 1e-4),
    v: -z / Math.max(metrics.depth, 1e-4),
  };
}

/** Keep a floor point in the same UV when the room morphs. */
export function remapFloor(
  prev: ShoeboxMetrics,
  next: ShoeboxMetrics,
  x: number,
  z: number,
): { x: number; z: number } {
  const { u, v } = floorUV(prev, x, z);
  const [nx, , nz] = floorPoint(next, u, v);
  return { x: nx, z: nz };
}
