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

export function computeShoebox(viewWidth: number, viewHeight: number): ShoeboxMetrics {
  const aspect = Math.max(viewWidth, 1) / Math.max(viewHeight, 1);
  const short = CEILING_SHORT_M;
  const width = aspect >= 1 ? short * aspect : short;
  const height = aspect >= 1 ? short : short / aspect;
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
