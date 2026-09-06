import { CHAIR_SIZE, CHAIR_STAND_GAP, chairFwd, chairLive } from "./furniture";
import { floorPoint, type ShoeboxMetrics } from "./shoebox";

export const ACTOR_RADIUS = 0.18;
export const WALL_PAD = 0.34;
const CHAIR_PAD = 0.04;
/** Keep this much air between the body and the chair when leaving. */
const CHAIR_LEAVE_GAP = 0.24;
/** Walk to this point first so the approach is from the open floor. */
const APPROACH_GAP = 0.45;

export type FloorXZ = { x: number; z: number };

export type Obstacle = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function chairLocal(x: number, z: number, metrics: ShoeboxMetrics) {
  const { x: cx, z: cz, yaw } = chairLive(metrics);
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

function chairWorld(lx: number, lz: number, metrics: ShoeboxMetrics): FloorXZ {
  const { x: cx, z: cz, yaw } = chairLive(metrics);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
}

function chairHalf() {
  return {
    hx: CHAIR_SIZE[0] / 2 + CHAIR_PAD,
    hz: CHAIR_SIZE[2] / 2 + CHAIR_PAD,
  };
}

/** Chair box grown by the body radius so planned hops stay walkable. */
function routeHalf() {
  const { hx, hz } = chairHalf();
  return { hx: hx + ACTOR_RADIUS, hz: hz + ACTOR_RADIUS };
}

function alongChair(
  metrics: ShoeboxMetrics,
  gap: number,
  sign = 1,
): [number, number, number] {
  const { x: cx, z: cz, yaw } = chairLive(metrics);
  const f = chairFwd(yaw);
  const d = CHAIR_SIZE[2] / 2 + gap;
  const walls = clampWalls(cx + sign * f.x * d, cz + sign * f.z * d, metrics);
  return [walls.x, 0, walls.z];
}

export function chairStandPoint(metrics: ShoeboxMetrics): [number, number, number] {
  return alongChair(metrics, CHAIR_STAND_GAP);
}

export function chairBackPoint(metrics: ShoeboxMetrics): [number, number, number] {
  return alongChair(metrics, CHAIR_STAND_GAP, -1);
}

export function chairApproachPoint(metrics: ShoeboxMetrics): [number, number, number] {
  return alongChair(metrics, APPROACH_GAP);
}

export function backReachable(metrics: ShoeboxMetrics): boolean {
  const { x: cx, z: cz, yaw } = chairLive(metrics);
  const f = chairFwd(yaw);
  const d = CHAIR_SIZE[2] / 2 + CHAIR_STAND_GAP;
  const raw = { x: cx - f.x * d, z: cz - f.z * d };
  const [bx, , bz] = chairBackPoint(metrics);
  if (overlapsChair(bx, bz, metrics)) return false;
  const standDist = Math.hypot(bx - cx, bz - cz);
  if (standDist < CHAIR_SIZE[2] / 2 + ACTOR_RADIUS) return false;
  if (Math.hypot(bx - raw.x, bz - raw.z) > 0.12 && standDist < d - 0.1) return false;
  return canWalkAway(bx, bz, metrics);
}

export function chairKickPoint(
  metrics: ShoeboxMetrics,
  from?: FloorXZ,
): [number, number, number] {
  const { x: cx, z: cz, yaw } = chairLive(metrics);
  const f = chairFwd(yaw);
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const inwardH = wallInwardHeading(cx, cz, metrics);
  const inward = { x: Math.sin(inwardH), z: Math.cos(inwardH) };
  const d = CHAIR_SIZE[2] / 2 + CHAIR_STAND_GAP;
  const faces = [
    { x: cx + f.x * d, z: cz + f.z * d },
    { x: cx - f.x * d, z: cz - f.z * d },
    { x: cx + right.x * d, z: cz + right.z * d },
    { x: cx - right.x * d, z: cz - right.z * d },
  ];
  const scored: { x: number; z: number; align: number; dist: number }[] = [];
  for (const face of faces) {
    const walls = clampWalls(face.x, face.z, metrics);
    if (overlapsChair(walls.x, walls.z, metrics)) continue;
    if (Math.hypot(walls.x - face.x, walls.z - face.z) > 0.18) continue;
    const align = kickIntoRoom(walls.x, walls.z, cx, cz, inward);
    if (align < 0.12) continue;
    scored.push({
      x: walls.x,
      z: walls.z,
      align,
      dist: from ? Math.hypot(walls.x - from.x, walls.z - from.z) : 0,
    });
  }
  if (scored.length === 0) {
    let best: { x: number; z: number; align: number } | null = null;
    for (const face of faces) {
      const walls = clampWalls(face.x, face.z, metrics);
      const align = kickIntoRoom(walls.x, walls.z, cx, cz, inward);
      if (!best || align > best.align) best = { x: walls.x, z: walls.z, align };
    }
    if (best && best.align > -0.05) return [best.x, 0, best.z];
    return chairStandPoint(metrics);
  }
  scored.sort((a, b) => {
    if (from) {
      const aHere = a.dist < 0.42 ? 1 : 0;
      const bHere = b.dist < 0.42 ? 1 : 0;
      if (aHere !== bHere) return bHere - aHere;
      if (Math.abs(a.align - b.align) > 0.12) return b.align - a.align;
      return a.dist - b.dist;
    }
    return b.align - a.align;
  });
  return [scored[0].x, 0, scored[0].z];
}

/** True when a kick from here would send the chair into the room, not into a wall. */
export function kickFacesOut(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  const { x: cx, z: cz } = chairLive(metrics);
  const inwardH = wallInwardHeading(cx, cz, metrics);
  const inward = { x: Math.sin(inwardH), z: Math.cos(inwardH) };
  return kickIntoRoom(x, z, cx, cz, inward) > 0.12;
}

function kickIntoRoom(
  x: number,
  z: number,
  cx: number,
  cz: number,
  inward: FloorXZ,
): number {
  const dx = cx - x;
  const dz = cz - z;
  const len = Math.hypot(dx, dz);
  if (len < 0.12) return -1;
  return (dx / len) * inward.x + (dz / len) * inward.z;
}

function wallInwardHeading(x: number, z: number, metrics: ShoeboxMetrics) {
  const left = x;
  const right = metrics.width - x;
  const opening = -z;
  const back = metrics.depth + z;
  const nearest = Math.min(left, right, opening, back);
  if (nearest === left) return Math.PI / 2;
  if (nearest === right) return -Math.PI / 2;
  if (nearest === opening) return Math.PI;
  return 0;
}

export function chairBody(metrics: ShoeboxMetrics): Obstacle {
  const { x, z, yaw } = chairLive(metrics);
  const hx = CHAIR_SIZE[0] / 2;
  const hz = CHAIR_SIZE[2] / 2;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const extX = hx * c + hz * s;
  const extZ = hx * s + hz * c;
  return { minX: x - extX, maxX: x + extX, minZ: z - extZ, maxZ: z + extZ };
}

export function chairObstacle(metrics: ShoeboxMetrics): Obstacle {
  const box = chairBody(metrics);
  const pad = CHAIR_PAD;
  return {
    minX: box.minX - pad,
    maxX: box.maxX + pad,
    minZ: box.minZ - pad,
    maxZ: box.maxZ + pad,
  };
}

export function insideChair(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  const { lx, lz } = chairLocal(x, z, metrics);
  const { hx, hz } = chairHalf();
  return Math.abs(lx) < hx && Math.abs(lz) < hz;
}

export function insideObstacle(x: number, z: number, box: Obstacle): boolean {
  return x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;
}

/** Positive = outside the chair box. Negative = inside. */
export function clearanceToChair(x: number, z: number, metrics: ShoeboxMetrics): number {
  const { lx, lz } = chairLocal(x, z, metrics);
  const { hx, hz } = chairHalf();
  const dx = Math.max(Math.abs(lx) - hx, 0);
  const dz = Math.max(Math.abs(lz) - hz, 0);
  if (dx === 0 && dz === 0) {
    return -Math.min(hx - Math.abs(lx), hz - Math.abs(lz));
  }
  return Math.hypot(dx, dz);
}

export function overlapsChair(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  return clearanceToChair(x, z, metrics) < ACTOR_RADIUS;
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
  const { lx, lz } = chairLocal(x, z, metrics);
  const { hx, hz } = chairHalf();
  const gap = CHAIR_LEAVE_GAP;
  if (lz > hz * 0.4) return { x, z };
  if (lz >= 0 && Math.abs(lx) <= hx + ACTOR_RADIUS) {
    if (lz >= hz + gap) return { x, z };
    return chairWorld(Math.min(hx, Math.max(-hx, lx)), hz + gap, metrics);
  }
  if (!insideChair(x, z, metrics) && !overlapsChair(x, z, metrics)) return { x, z };
  const left = lx + hx;
  const right = hx - lx;
  const front = hz - lz;
  const back = lz + hz;
  const nearest = Math.min(left, right, front, back);
  const pad = gap;
  if (nearest === front) return chairWorld(lx, hz + pad, metrics);
  if (nearest === back) return chairWorld(lx, -hz - pad, metrics);
  if (nearest === left) return chairWorld(-hx - pad, lz, metrics);
  return chairWorld(hx + pad, lz, metrics);
}

export function behindChair(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  return chairLocal(x, z, metrics).lz < 0;
}

export function onChairBack(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  const { lx, lz } = chairLocal(x, z, metrics);
  const { hx, hz } = chairHalf();
  return lz <= -hz * 0.15 && Math.abs(lx) <= hx + ACTOR_RADIUS + 0.16;
}

export function resolveBehindChair(
  x: number,
  z: number,
  metrics: ShoeboxMetrics,
): [number, number, number] {
  const walls = clampWalls(x, z, metrics);
  if (!insideChair(walls.x, walls.z, metrics) && !overlapsChair(walls.x, walls.z, metrics)) {
    return [walls.x, 0, walls.z];
  }
  const { lx } = chairLocal(walls.x, walls.z, metrics);
  const { hx, hz } = chairHalf();
  const gap = CHAIR_LEAVE_GAP;
  const slots = [
    Math.min(hx, Math.max(-hx, lx)),
    0,
    -hx * 0.55,
    hx * 0.55,
    -hx,
    hx,
  ];
  for (const nx of slots) {
    const out = chairWorld(nx, -hz - gap, metrics);
    const again = clampWalls(out.x, out.z, metrics);
    if (!overlapsChair(again.x, again.z, metrics) && behindChair(again.x, again.z, metrics)) {
      return [again.x, 0, again.z];
    }
  }
  const sides = [
    chairWorld(-hx - gap, -hz * 0.35, metrics),
    chairWorld(hx + gap, -hz * 0.35, metrics),
  ];
  for (const side of sides) {
    const again = clampWalls(side.x, side.z, metrics);
    if (!overlapsChair(again.x, again.z, metrics)) return [again.x, 0, again.z];
  }
  const fallback = chairWorld(0, -hz - gap, metrics);
  const clamped = clampWalls(fallback.x, fallback.z, metrics);
  return [clamped.x, 0, clamped.z];
}

export function resolveFloor(
  x: number,
  z: number,
  metrics: ShoeboxMetrics,
): [number, number, number] {
  const walls = clampWalls(x, z, metrics);
  const cleared = pushOutOfChair(walls.x, walls.z, metrics);
  const again = clampWalls(cleared.x, cleared.z, metrics);
  if (!overlapsChair(again.x, again.z, metrics)) return [again.x, 0, again.z];
  const { hx, hz } = chairHalf();
  const gap = CHAIR_LEAVE_GAP;
  const slots = [
    chairWorld(0, hz + gap, metrics),
    chairWorld(0, -hz - gap, metrics),
    chairWorld(-hx - gap, 0, metrics),
    chairWorld(hx + gap, 0, metrics),
    chairWorld(-hx - gap, hz + gap, metrics),
    chairWorld(hx + gap, hz + gap, metrics),
    chairWorld(-hx - gap, -hz - gap, metrics),
    chairWorld(hx + gap, -hz - gap, metrics),
  ];
  let best = again;
  let bestScore = -1e9;
  for (const slot of slots) {
    const held = clampWalls(slot.x, slot.z, metrics);
    const overlap = overlapsChair(held.x, held.z, metrics);
    const clear = clearanceToChair(held.x, held.z, metrics);
    const score = (overlap ? -8 : 2) + clear - Math.hypot(held.x - walls.x, held.z - walls.z) * 0.15;
    if (score > bestScore) {
      best = held;
      bestScore = score;
    }
  }
  return [best.x, 0, best.z];
}

export function stepHitsChair(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  metrics: ShoeboxMetrics,
): boolean {
  const before = clearanceToChair(ax, az, metrics);
  const after = clearanceToChair(bx, bz, metrics);
  if (after >= before - 0.002) return false;
  if (after >= ACTOR_RADIUS) return false;
  return segmentHitsObb(ax, az, bx, bz, metrics) || after < before;
}

function segmentHitsObb(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  metrics: ShoeboxMetrics,
): boolean {
  const a = chairLocal(ax, az, metrics);
  const b = chairLocal(bx, bz, metrics);
  const { hx, hz } = routeHalf();
  return segmentHits(a.lx, a.lz, b.lx, b.lz, {
    minX: -hx,
    maxX: hx,
    minZ: -hz,
    maxZ: hz,
  });
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

function pathHitsObb(from: FloorXZ, hops: FloorXZ[], metrics: ShoeboxMetrics) {
  let prev = from;
  for (const hop of hops) {
    if (segmentHitsObb(prev.x, prev.z, hop.x, hop.z, metrics)) return true;
    prev = hop;
  }
  return false;
}

export function routeAroundChair(
  from: FloorXZ,
  to: FloorXZ,
  metrics: ShoeboxMetrics,
  preferFront = false,
  preferBack = false,
): FloorXZ[] {
  if (preferFront) {
    const [ax, , az] = chairApproachPoint(metrics);
    const via = { x: ax, z: az };
    const nearVia = Math.hypot(via.x - to.x, via.z - to.z) < 0.08;
    if (!segmentHitsObb(from.x, from.z, via.x, via.z, metrics)) {
      return nearVia ? [to] : [via, to];
    }
    if (!segmentHitsObb(from.x, from.z, to.x, to.z, metrics)) return [to];
  } else if (!segmentHitsObb(from.x, from.z, to.x, to.z, metrics)) {
    return [to];
  }

  const { hx, hz } = routeHalf();
  const e = 0.06;
  const corners: FloorXZ[] = [
    chairWorld(-hx - e, -hz - e, metrics),
    chairWorld(hx + e, -hz - e, metrics),
    chairWorld(-hx - e, hz + e, metrics),
    chairWorld(hx + e, hz + e, metrics),
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
    if (!pathHitsObb(from, hops, metrics)) candidates.push(hops);
  }
  for (const [a, b] of edges) {
    const ab = [a, b, to];
    const ba = [b, a, to];
    if (!pathHitsObb(from, ab, metrics)) candidates.push(ab);
    if (!pathHitsObb(from, ba, metrics)) candidates.push(ba);
  }

  if (candidates.length === 0) {
    for (const c of corners) {
      const [x, , z] = resolveFloor(c.x, c.z, metrics);
      const hop = { x, z };
      if (pathHitsObb(from, [hop], metrics)) continue;
      candidates.push([hop, to]);
    }
  }
  if (candidates.length === 0) {
    let nearest: FloorXZ | null = null;
    let nearestD = 1e9;
    for (const c of corners) {
      const [x, , z] = resolveFloor(c.x, c.z, metrics);
      const hop = { x, z };
      if (pathHitsObb(from, [hop], metrics)) continue;
      const d = Math.hypot(hop.x - from.x, hop.z - from.z);
      if (d > 0.08 && d < nearestD) {
        nearest = hop;
        nearestD = d;
      }
    }
    return nearest ? [nearest] : [];
  }
  const usable = candidates;
  const { x: cx, z: cz, yaw } = chairLive(metrics);
  const f = chairFwd(yaw);
  const scored = usable.map((hops) => {
    const frontBias =
      preferFront &&
      hops.some((p) => p !== to && (p.x - cx) * f.x + (p.z - cz) * f.z < 0)
        ? 4
        : 0;
    const backBias =
      preferBack &&
      hops.some((p) => p !== to && (p.x - cx) * f.x + (p.z - cz) * f.z > 0)
        ? 4
        : 0;
    return { hops, cost: pathLen(from, hops) + frontBias + backBias };
  });
  scored.sort((a, b) => a.cost - b.cost);

  return scored[0].hops
    .map((p, i, all) => {
      const last = i === all.length - 1;
      if (preferFront && last) return p;
      if (preferBack && (last || behindChair(p.x, p.z, metrics))) {
        const [x, , z] = resolveBehindChair(p.x, p.z, metrics);
        return { x, z };
      }
      const [x, , z] = resolveFloor(p.x, p.z, metrics);
      return { x, z };
    })
    .filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 0.06);
}

export function clearStepAlong(
  x: number,
  z: number,
  heading: number,
  dist: number,
  metrics: ShoeboxMetrics,
): FloorXZ | null {
  const nx = x + Math.sin(heading) * dist;
  const nz = z + Math.cos(heading) * dist;
  if (stepHitsChair(x, z, nx, nz, metrics)) return null;
  const [rx, , rz] = resolveFloor(nx, nz, metrics);
  if (overlapsChair(rx, rz, metrics)) return null;
  if (stepHitsChair(x, z, rx, rz, metrics)) return null;
  if (Math.hypot(rx - x, rz - z) < dist * 0.55) return null;
  return { x: rx, z: rz };
}

export function canTakeWalkStep(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  for (let i = 0; i < 16; i += 1) {
    const a = (i * Math.PI * 2) / 16;
    const nx = x + Math.sin(a) * 0.08;
    const nz = z + Math.cos(a) * 0.08;
    const intended = Math.hypot(nx - x, nz - z);
    if (intended < 0.003) continue;
    if (stepHitsChair(x, z, nx, nz, metrics)) continue;
    const [rx, , rz] = resolveFloor(nx, nz, metrics);
    const along = ((rx - x) * (nx - x) + (rz - z) * (nz - z)) / intended;
    if (along >= 0.0015) return true;
  }
  return false;
}

export function canReachPoint(
  from: FloorXZ,
  to: FloorXZ,
  metrics: ShoeboxMetrics,
  preferBack = false,
): boolean {
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  if (dist < 0.42) {
    if (!stepHitsChair(from.x, from.z, to.x, to.z, metrics) && !segmentHitsObb(from.x, from.z, to.x, to.z, metrics)) {
      return true;
    }
  } else if (!canTakeWalkStep(from.x, from.z, metrics)) {
    return false;
  }
  const hops = routeAroundChair(from, to, metrics, false, preferBack);
  if (hops.length === 0) return false;
  const end = hops[hops.length - 1] ?? to;
  if (Math.hypot(end.x - to.x, end.z - to.z) > 0.35) return false;
  if (pathHitsObb(from, hops, metrics)) return false;
  return true;
}

export function canWalkAway(x: number, z: number, metrics: ShoeboxMetrics): boolean {
  let fromX = x;
  let fromZ = z;
  if (overlapsChair(fromX, fromZ, metrics)) {
    const [px, , pz] = resolveFloor(fromX, fromZ, metrics);
    if (overlapsChair(px, pz, metrics)) return false;
    if (Math.hypot(px - fromX, pz - fromZ) > 0.2) return false;
    fromX = px;
    fromZ = pz;
  }
  if (!canTakeWalkStep(fromX, fromZ, metrics)) return false;
  const goals: FloorXZ[] = [
    floorGoal(metrics, 0.5, 0.5),
    floorGoal(metrics, 0.3, 0.35),
    floorGoal(metrics, 0.7, 0.35),
  ];
  for (const goal of goals) {
    if (Math.hypot(goal.x - fromX, goal.z - fromZ) < 0.38) continue;
    if (overlapsChair(goal.x, goal.z, metrics)) continue;
    const hops = routeAroundChair({ x: fromX, z: fromZ }, goal, metrics);
    const end = hops[hops.length - 1] ?? goal;
    if (Math.hypot(end.x - fromX, end.z - fromZ) < 0.38) continue;
    if (pathHitsObb({ x: fromX, z: fromZ }, hops, metrics)) continue;
    return true;
  }
  for (let i = 0; i < 16; i += 1) {
    const a = (i * Math.PI * 2) / 16;
    for (const d of [0.42, 0.7]) {
      const [rx, , rz] = resolveFloor(fromX + Math.sin(a) * d, fromZ + Math.cos(a) * d, metrics);
      if (Math.hypot(rx - fromX, rz - fromZ) < 0.3) continue;
      if (overlapsChair(rx, rz, metrics)) continue;
      if (segmentHitsObb(fromX, fromZ, rx, rz, metrics)) continue;
      return true;
    }
  }
  return false;
}

function floorGoal(metrics: ShoeboxMetrics, u: number, v: number): FloorXZ {
  const [x, , z] = floorPoint(metrics, u, v);
  const [rx, , rz] = resolveFloor(x, z, metrics);
  return { x: rx, z: rz };
}

export function randomClearFloor(metrics: ShoeboxMetrics): [number, number, number] {
  for (let i = 0; i < 10; i += 1) {
    const u = 0.16 + Math.random() * 0.68;
    const v = 0.2 + Math.random() * 0.58;
    const [x, , z] = floorPoint(metrics, u, v);
    const resolved = resolveFloor(x, z, metrics);
    if (!insideChair(resolved[0], resolved[2], metrics)) return resolved;
  }
  return chairStandPoint(metrics);
}
