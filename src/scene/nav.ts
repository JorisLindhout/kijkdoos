import { CHAIR_SIZE, CHAIR_U, CHAIR_V } from "./ChairBox";
import { floorPoint, type ShoeboxMetrics } from "./shoebox";

export const ACTOR_RADIUS = 0.3;
export const WALL_PAD = 0.34;

export type FloorXZ = { x: number; z: number };

export type Obstacle = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function chairStandPoint(metrics: ShoeboxMetrics): [number, number, number] {
  const [x, , z] = floorPoint(metrics, CHAIR_U, CHAIR_V);
  return [x, 0, z + CHAIR_SIZE[2] / 2 + ACTOR_RADIUS + 0.08];
}

export function chairBody(metrics: ShoeboxMetrics): Obstacle {
  const [x, , z] = floorPoint(metrics, CHAIR_U, CHAIR_V);
  const hx = CHAIR_SIZE[0] / 2;
  const hz = CHAIR_SIZE[2] / 2;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}

export function chairObstacle(metrics: ShoeboxMetrics): Obstacle {
  const box = chairBody(metrics);
  const pad = ACTOR_RADIUS + 0.1;
  return {
    minX: box.minX - pad,
    maxX: box.maxX + pad,
    minZ: box.minZ - pad,
    maxZ: box.maxZ + pad,
  };
}

export function insideObstacle(x: number, z: number, box: Obstacle): boolean {
  return x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;
}

export function overlapsChair(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  const box = chairBody(metrics);
  const cx = Math.min(box.maxX, Math.max(box.minX, x));
  const cz = Math.min(box.maxZ, Math.max(box.minZ, z));
  return Math.hypot(x - cx, z - cz) < ACTOR_RADIUS;
}

export function clampWalls(
  x: number,
  z: number,
  metrics: ShoeboxMetrics,
  pad = WALL_PAD,
): FloorXZ {
  return {
    x: Math.min(metrics.width - pad, Math.max(pad, x)),
    z: Math.min(-pad, Math.max(-metrics.depth + pad, z)),
  };
}

export function pushOutOfChair(x: number, z: number, metrics: ShoeboxMetrics): FloorXZ {
  const box = chairObstacle(metrics);
  if (!insideObstacle(x, z, box) && !overlapsChair(x, z, metrics)) return { x, z };
  const left = x - box.minX;
  const right = box.maxX - x;
  const front = box.maxZ - z;
  const back = z - box.minZ;
  const nearest = Math.min(left, right, front, back);
  if (nearest === left) return { x: box.minX, z };
  if (nearest === right) return { x: box.maxX, z };
  if (nearest === front) return { x, z: box.maxZ };
  return { x, z: box.minZ };
}

export function resolveFloor(
  x: number,
  z: number,
  metrics: ShoeboxMetrics,
): [number, number, number] {
  const walls = clampWalls(x, z, metrics);
  const cleared = pushOutOfChair(walls.x, walls.z, metrics);
  const again = clampWalls(cleared.x, cleared.z, metrics);
  return [again.x, 0, again.z];
}

export function stepHitsChair(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  metrics: ShoeboxMetrics,
): boolean {
  return segmentHits(ax, az, bx, bz, chairObstacle(metrics));
}

function segmentHits(ax: number, az: number, bx: number, bz: number, box: Obstacle): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;
  const slabs: [number, number, number][] = [
    [dx, box.minX - ax, box.maxX - ax],
    [dz, box.minZ - az, box.maxZ - az],
  ];
  for (const [delta, n0, n1] of slabs) {
    if (Math.abs(delta) < 1e-8) {
      if (n0 > 0 || n1 < 0) return false;
      continue;
    }
    let t0 = n0 / delta;
    let t1 = n1 / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return false;
  }
  return true;
}

function pathLen(from: FloorXZ, hops: FloorXZ[]) {
  let len = 0;
  let prev = from;
  for (const hop of hops) {
    len += Math.hypot(hop.x - prev.x, hop.z - prev.z);
    prev = hop;
  }
  return len;
}

function pathHits(from: FloorXZ, hops: FloorXZ[], box: Obstacle) {
  let prev = from;
  for (const hop of hops) {
    if (segmentHits(prev.x, prev.z, hop.x, hop.z, box)) return true;
    prev = hop;
  }
  return false;
}

export function routeAroundChair(
  from: FloorXZ,
  to: FloorXZ,
  metrics: ShoeboxMetrics,
  preferFront = false,
): FloorXZ[] {
  const box = chairObstacle(metrics);
  if (!segmentHits(from.x, from.z, to.x, to.z, box)) return [to];

  const e = 0.04;
  const corners: FloorXZ[] = [
    { x: box.minX - e, z: box.minZ - e },
    { x: box.maxX + e, z: box.minZ - e },
    { x: box.minX - e, z: box.maxZ + e },
    { x: box.maxX + e, z: box.maxZ + e },
  ];
  const edges: [FloorXZ, FloorXZ][] = [
    [corners[0], corners[1]],
    [corners[2], corners[3]],
    [corners[0], corners[2]],
    [corners[1], corners[3]],
  ];

  const candidates: FloorXZ[][] = [];
  for (const c of corners) {
    const hops = [c, to];
    if (!pathHits(from, hops, box)) candidates.push(hops);
  }
  for (const [a, b] of edges) {
    const ab = [a, b, to];
    const ba = [b, a, to];
    if (!pathHits(from, ab, box)) candidates.push(ab);
    if (!pathHits(from, ba, box)) candidates.push(ba);
  }

  const usable = candidates.length > 0
    ? candidates
    : edges.map(([a, b]) => [a, b, to]);
  const scored = usable.map((hops) => {
    const frontBias =
      preferFront && hops.some((p) => p !== to && p.z < box.maxZ) ? 4 : 0;
    return { hops, cost: pathLen(from, hops) + frontBias };
  });
  scored.sort((a, b) => a.cost - b.cost);

  return scored[0].hops
    .map((p, i, all) => {
      if (preferFront && i === all.length - 1) return p;
      const [x, , z] = resolveFloor(p.x, p.z, metrics);
      return { x, z };
    })
    .filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 0.06);
}

export function randomClearFloor(metrics: ShoeboxMetrics): [number, number, number] {
  for (let i = 0; i < 10; i += 1) {
    const u = 0.16 + Math.random() * 0.68;
    const v = 0.2 + Math.random() * 0.58;
    const [x, , z] = floorPoint(metrics, u, v);
    const resolved = resolveFloor(x, z, metrics);
    if (!insideObstacle(resolved[0], resolved[2], chairObstacle(metrics))) return resolved;
  }
  return chairStandPoint(metrics);
}
