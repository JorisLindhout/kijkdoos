import { useEffect, useState } from "react";
import { floorPoint, floorUV, type ShoeboxMetrics } from "./shoebox";

export const CHAIR_ID = "chair-1";
export const CHAIR_SEAT_HEIGHT = 0.47;
export const CHAIR_SEAT = CHAIR_SEAT_HEIGHT;
export const CHAIR_SIZE: [number, number, number] = [
  CHAIR_SEAT,
  CHAIR_SEAT_HEIGHT,
  CHAIR_SEAT,
];
export const DEFAULT_CHAIR_YAW = (-60 * Math.PI) / 180;
export const CHAIR_STAND_GAP = 0.32;
const CORNER_INSET = 0.54;
const CHAIR_WALL = 0.1;
const ROOM_WALL_PAD = 0.34;
const ACTOR_R = 0.18;
const BAD_CAP = 40;

export type ChairUV = {
  u: number;
  v: number;
  yaw: number;
};

export type ChairWorld = {
  x: number;
  z: number;
  yaw: number;
};

const listeners = new Set<() => void>();

let chair: ChairUV = { u: 0.82, v: 0.78, yaw: DEFAULT_CHAIR_YAW };
let lightOn = true;
let yankId = 0;
let badChair: ChairUV[] = [];

export function subscribeFurniture(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  for (const fn of listeners) fn();
}

export function useFurniture() {
  const [, bump] = useState(0);
  useEffect(() => subscribeFurniture(() => bump((n) => n + 1)), []);
  return { chair, lightOn, yankId };
}

export function defaultChairUV(metrics: ShoeboxMetrics): ChairUV {
  const x = metrics.width - CORNER_INSET;
  const z = -metrics.depth + CORNER_INSET;
  const uv = floorUV(metrics, x, z);
  return clampChairUV({ u: uv.u, v: uv.v, yaw: DEFAULT_CHAIR_YAW }, metrics);
}

export function getChairUV() {
  return chair;
}

export function getLightOn() {
  return lightOn;
}

export function yankCord() {
  yankId += 1;
  emit();
}

export function setLightOn(on: boolean) {
  if (lightOn === on) return;
  lightOn = on;
  emit();
}

export function setChairUV(next: ChairUV, metrics: ShoeboxMetrics) {
  const clamped = clampChairUV(next, metrics);
  if (clamped.u === chair.u && clamped.v === chair.v && clamped.yaw === chair.yaw) return;
  chair = clamped;
  emit();
}

export function hydrateFurniture(
  saved: { chair?: ChairUV; lightOn?: boolean; badChair?: ChairUV[] },
  metrics: ShoeboxMetrics,
) {
  chair = clampChairUV(saved.chair ?? defaultChairUV(metrics), metrics);
  lightOn = saved.lightOn ?? true;
  badChair = Array.isArray(saved.badChair) ? saved.badChair.slice(-BAD_CAP) : [];
  emit();
}

export function getBadChair() {
  return badChair;
}

export function chairPoseKey(uv: ChairUV) {
  const yaw = Math.round(wrapPi(uv.yaw) / (Math.PI / 8));
  const bucket = ((yaw % 16) + 16) % 16;
  const u = Math.round(uv.u * 20) / 20;
  const v = Math.round(uv.v * 20) / 20;
  return `${u.toFixed(2)}:${v.toFixed(2)}:${bucket}`;
}

export function isBadChair(uv: ChairUV) {
  const key = chairPoseKey(uv);
  return badChair.some((pose) => chairPoseKey(pose) === key);
}

export function rememberBadChair(uv: ChairUV) {
  if (isBadChair(uv)) return;
  badChair.push({ u: uv.u, v: uv.v, yaw: uv.yaw });
  if (badChair.length > BAD_CAP) badChair.shift();
}

export function chairFwd(yaw: number) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function chairLive(metrics: ShoeboxMetrics): ChairWorld {
  const [x, , z] = floorPoint(metrics, chair.u, chair.v);
  return { x, z, yaw: chair.yaw };
}

export function chairSitPoint(metrics: ShoeboxMetrics): [number, number, number] {
  const { x, z, yaw } = chairLive(metrics);
  const f = chairFwd(yaw);
  const d = CHAIR_SEAT / 2 - 0.01;
  return [x + f.x * d, 0, z + f.z * d];
}

export function chairExtent(yaw: number) {
  const hx = CHAIR_SIZE[0] / 2;
  const hz = CHAIR_SIZE[2] / 2;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return { extX: hx * c + hz * s, extZ: hx * s + hz * c };
}

export function clampChairUV(uv: ChairUV, metrics: ShoeboxMetrics): ChairUV {
  const [rawX, , rawZ] = floorPoint(metrics, uv.u, uv.v);
  const { extX, extZ } = chairExtent(uv.yaw);
  const padX = extX + CHAIR_WALL;
  const padZ = extZ + CHAIR_WALL;
  const x = Math.min(metrics.width - padX, Math.max(padX, rawX));
  const z = Math.min(-padZ, Math.max(-metrics.depth + padZ, rawZ));
  const { u, v } = floorUV(metrics, x, z);
  return { u, v, yaw: uv.yaw };
}

export function randomChairUV(metrics: ShoeboxMetrics): ChairUV | null {
  const live = chairLive(metrics);
  for (let i = 0; i < 32; i += 1) {
    const next = clampChairUV(
      {
        u: 0.16 + Math.random() * 0.68,
        v: 0.18 + Math.random() * 0.64,
        yaw: (Math.random() * 2 - 1) * Math.PI,
      },
      metrics,
    );
    const [x, , z] = floorPoint(metrics, next.u, next.v);
    if (Math.hypot(x - live.x, z - live.z) <= 0.28) continue;
    if (isBadChair(next) || poseBlocksLeave(next, metrics) || poseBlocksBack(next, metrics)) {
      continue;
    }
    return next;
  }
  return null;
}

export function pushChairUV(
  metrics: ShoeboxMetrics,
  opts?: { dist?: number; prefer?: number[]; allowTrap?: boolean },
): ChairUV | null {
  const live = chairLive(metrics);
  const dist = opts?.dist;
  const distances = dist != null ? [dist] : [0.8, 0.62, 0.48, 0.36, 0.26];
  const headings = [...(opts?.prefer ?? [])];
  headings.push(live.yaw, live.yaw + Math.PI);
  const spin = Math.random() * Math.PI * 2;
  for (let i = 0; i < 14; i += 1) headings.push(spin + (i * Math.PI * 2) / 14);
  let fallback: { uv: ChairUV; score: number } | null = null;
  const seen = new Set<string>();
  const inward = opts?.prefer?.[0];
  for (const d of distances) {
    const minMove = Math.min(0.22, d * 0.55);
    for (const heading of headings) {
      const dir = { x: Math.sin(heading), z: Math.cos(heading) };
      const { u, v } = floorUV(metrics, live.x + dir.x * d, live.z + dir.z * d);
      const next = clampChairUV({ u, v, yaw: live.yaw }, metrics);
      const [nx, , nz] = floorPoint(metrics, next.u, next.v);
      const moved = Math.hypot(nx - live.x, nz - live.z);
      if (moved < minMove) continue;
      const key = chairPoseKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      const toward =
        inward == null ? moved : moved * Math.cos(wrapPi(heading - inward));
      if (
        !opts?.allowTrap &&
        (isBadChair(next) || poseBlocksLeave(next, metrics) || poseBlocksBack(next, metrics))
      ) {
        if (!fallback || toward > fallback.score) fallback = { uv: next, score: toward };
        continue;
      }
      return next;
    }
  }
  if (opts?.allowTrap) return fallback?.uv ?? null;
  return null;
}

export function pushAwayFromWall(metrics: ShoeboxMetrics, dist?: number): ChairUV | null {
  const live = chairLive(metrics);
  const inward = wallInwardHeading(live.x, live.z, metrics);
  const center = Math.atan2(metrics.width / 2 - live.x, -metrics.depth / 2 - live.z);
  const prefer = [inward, center, inward + 0.45, inward - 0.45];
  const legal = pushChairUV(metrics, { prefer, dist });
  if (legal) return legal;
  const forced = pushChairUV(metrics, { prefer, dist, allowTrap: true });
  if (forced) return forced;
  const { u, v } = floorUV(metrics, metrics.width / 2, -metrics.depth / 2);
  const safe = clampChairUV({ u, v, yaw: live.yaw }, metrics);
  const [sx, , sz] = floorPoint(metrics, safe.u, safe.v);
  if (Math.hypot(sx - live.x, sz - live.z) >= 0.16) return safe;
  return null;
}

/** Slide the chair away from the kicker, biased into the room. Never toward his feet. */
export function kickSlideFrom(
  metrics: ShoeboxMetrics,
  fromX: number,
  fromZ: number,
  dist?: number,
): ChairUV | null {
  const live = chairLive(metrics);
  const dx = live.x - fromX;
  const dz = live.z - fromZ;
  const len = Math.hypot(dx, dz);
  const kickH = len > 1e-4 ? Math.atan2(dx, dz) : wallInwardHeading(live.x, live.z, metrics);
  const inward = wallInwardHeading(live.x, live.z, metrics);
  const center = Math.atan2(metrics.width / 2 - live.x, -metrics.depth / 2 - live.z);
  const prefer = [
    mixHeading(kickH, inward, 0.35),
    kickH,
    mixHeading(kickH, inward, 0.55),
    inward,
    center,
    kickH + 0.4,
    kickH - 0.4,
  ];
  const distances = dist != null ? [dist] : [0.48, 0.36, 0.62, 0.26];
  let best: { uv: ChairUV; score: number } | null = null;
  for (const d of distances) {
    for (const allowTrap of [false, true]) {
      const uv = pushChairUV(metrics, { prefer, dist: d, allowTrap });
      if (!uv) continue;
      const score = kickSlideScore(metrics, uv, kickH, inward);
      if (score == null) continue;
      if (!best || score > best.score) best = { uv, score };
      if (score > 0.55) return uv;
    }
  }
  if (best && best.score > 0.12) return best.uv;
  return null;
}

function mixHeading(a: number, b: number, t: number) {
  const x = (1 - t) * Math.sin(a) + t * Math.sin(b);
  const z = (1 - t) * Math.cos(a) + t * Math.cos(b);
  return Math.atan2(x, z);
}

function kickSlideScore(
  metrics: ShoeboxMetrics,
  uv: ChairUV,
  kickH: number,
  inward: number,
): number | null {
  const live = chairLive(metrics);
  const [nx, , nz] = floorPoint(metrics, uv.u, uv.v);
  const mx = nx - live.x;
  const mz = nz - live.z;
  const moved = Math.hypot(mx, mz);
  if (moved < 0.12) return null;
  const moveH = Math.atan2(mx, mz);
  const kickAlign = Math.cos(wrapPi(moveH - kickH));
  const inAlign = Math.cos(wrapPi(moveH - inward));
  if (kickAlign < -0.15) return null;
  if (kickAlign < 0.12 && inAlign < 0.12) return null;
  return kickAlign * 1.4 + Math.max(0, inAlign) * 0.6 + moved * 0.2;
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

function poseBlocksLeave(uv: ChairUV, metrics: ShoeboxMetrics) {
  return poseBlocksContact(uv, metrics, 1);
}

function poseBlocksBack(uv: ChairUV, metrics: ShoeboxMetrics) {
  return poseBlocksContact(uv, metrics, -1);
}

function poseBlocksContact(uv: ChairUV, metrics: ShoeboxMetrics, sign: 1 | -1) {
  const pose = clampChairUV(uv, metrics);
  const [cx, , cz] = floorPoint(metrics, pose.u, pose.v);
  const f = chairFwd(pose.yaw);
  const d = CHAIR_SIZE[2] / 2 + CHAIR_STAND_GAP;
  const raw = { x: cx + sign * f.x * d, z: cz + sign * f.z * d };
  const stand = clampRoom(raw.x, raw.z, metrics);
  if (pointHitsChair(pose, stand.x, stand.z, metrics, ACTOR_R)) return true;
  const standDist = Math.hypot(stand.x - cx, stand.z - cz);
  if (standDist < CHAIR_SIZE[2] / 2 + ACTOR_R) return true;
  if (Math.hypot(stand.x - raw.x, stand.z - raw.z) > 0.12 && standDist < d - 0.1) {
    return true;
  }
  for (let i = 0; i < 16; i += 1) {
    const a = (i * Math.PI * 2) / 16;
    const p = clampRoom(stand.x + Math.sin(a) * 0.5, stand.z + Math.cos(a) * 0.5, metrics);
    if (Math.hypot(p.x - stand.x, p.z - stand.z) < 0.3) continue;
    if (pointHitsChair(pose, p.x, p.z, metrics, ACTOR_R)) continue;
    return false;
  }
  return true;
}

function pointHitsChair(
  uv: ChairUV,
  x: number,
  z: number,
  metrics: ShoeboxMetrics,
  radius: number,
) {
  const [cx, , cz] = floorPoint(metrics, uv.u, uv.v);
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(uv.yaw);
  const s = Math.sin(uv.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const hx = CHAIR_SIZE[0] / 2;
  const hz = CHAIR_SIZE[2] / 2;
  const ox = Math.max(Math.abs(lx) - hx, 0);
  const oz = Math.max(Math.abs(lz) - hz, 0);
  if (ox === 0 && oz === 0) return true;
  return Math.hypot(ox, oz) < radius;
}

function clampRoom(x: number, z: number, metrics: ShoeboxMetrics) {
  return {
    x: Math.min(metrics.width - ROOM_WALL_PAD, Math.max(ROOM_WALL_PAD, x)),
    z: Math.min(-ROOM_WALL_PAD, Math.max(-metrics.depth + ROOM_WALL_PAD, z)),
  };
}

function wrapPi(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function lerpChairUV(a: ChairUV, b: ChairUV, t: number): ChairUV {
  const u = Math.min(1, Math.max(0, t));
  let dyaw = b.yaw - a.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  return {
    u: a.u + (b.u - a.u) * u,
    v: a.v + (b.v - a.v) * u,
    yaw: a.yaw + dyaw * u,
  };
}
