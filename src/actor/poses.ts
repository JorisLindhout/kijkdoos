import { CHAIR_SEAT_HEIGHT } from "../scene/ChairBox";
import { BODY, HIP_HEIGHT, type JointId } from "./blockBody";

export type EulerXYZ = [number, number, number];
export type JointMap = Partial<Record<JointId, EulerXYZ>>;

export type Pose = {
  hipsY?: number;
  hipsX?: number;
  rot: JointMap;
  stance?: "l" | "r";
};

export type PoseKey = { t: number; pose: Pose };

export type ClipDef =
  | { kind: "walk"; duration: number }
  | { kind: "keys"; duration: number; keys: PoseKey[] };

const D = Math.PI / 180;
const PLANT = 0.018;

export const STAND: Pose = {
  hipsY: HIP_HEIGHT - PLANT,
  hipsX: 0,
  rot: {
    upperarm_l: [0, 0, 12 * D],
    lowerarm_l: [-8 * D, 0, 0],
    upperarm_r: [0, 0, -12 * D],
    lowerarm_r: [-8 * D, 0, 0],
    thigh_l: [2 * D, 0, -3 * D],
    shin_l: [0, 0, 0],
    foot_l: [-2 * D, 0, 0],
    thigh_r: [2 * D, 0, 3 * D],
    shin_r: [0, 0, 0],
    foot_r: [-2 * D, 0, 0],
  },
};

const SIT: Pose = {
  hipsY: CHAIR_SEAT_HEIGHT,
  hipsX: 0,
  rot: {
    torso: [6 * D, 0, 0],
    upperarm_l: [-12 * D, 0, 10 * D],
    lowerarm_l: [-40 * D, 0, 0],
    upperarm_r: [-12 * D, 0, -10 * D],
    lowerarm_r: [-40 * D, 0, 0],
    thigh_l: [-88 * D, 0, -4 * D],
    shin_l: [86 * D, 0, 0],
    foot_l: [4 * D, 0, 0],
    thigh_r: [-88 * D, 0, 4 * D],
    shin_r: [86 * D, 0, 0],
    foot_r: [4 * D, 0, 0],
  },
};

const SQUAT: Pose = {
  hipsY: HIP_HEIGHT * 0.62,
  hipsX: 0,
  rot: {
    torso: [12 * D, 0, 0],
    upperarm_l: [8 * D, 0, 10 * D],
    lowerarm_l: [-16 * D, 0, 0],
    upperarm_r: [8 * D, 0, -10 * D],
    lowerarm_r: [-16 * D, 0, 0],
    thigh_l: [-55 * D, 0, -4 * D],
    shin_l: [70 * D, 0, 0],
    thigh_r: [-55 * D, 0, 4 * D],
    shin_r: [70 * D, 0, 0],
  },
};

const WAVE_UP: Pose = {
  ...STAND,
  rot: {
    ...STAND.rot,
    upperarm_r: [-25 * D, 0, -110 * D],
    lowerarm_r: [0, 0, -35 * D],
    head: [0, 12 * D, -6 * D],
  },
};

const WAVE_OUT: Pose = {
  ...WAVE_UP,
  rot: {
    ...WAVE_UP.rot,
    lowerarm_r: [0, 0, -8 * D],
  },
};

const GLARE: Pose = {
  hipsY: HIP_HEIGHT,
  hipsX: 0,
  rot: {
    torso: [12 * D, 0, 0],
    head: [8 * D, 6 * D, 0],
    upperarm_l: [10 * D, 0, 10 * D],
    lowerarm_l: [-16 * D, 0, 0],
    upperarm_r: [10 * D, 0, -10 * D],
    lowerarm_r: [-16 * D, 0, 0],
    thigh_l: [4 * D, 0, -4 * D],
    thigh_r: [4 * D, 0, 4 * D],
  },
};

function keys(pairs: [number, Pose][]): PoseKey[] {
  return pairs.map(([t, pose]) => ({ t, pose }));
}

export const WALK_DURATION = 1.2;
export const WALK_HALF_STRIDE = 0.18;

export const CLIPS: Record<string, ClipDef> = {
  Stand_Still: { kind: "keys", duration: 0.05, keys: keys([[0, STAND]]) },
  Walk_Loop: { kind: "walk", duration: WALK_DURATION },
  Sitting_Enter: {
    kind: "keys",
    duration: 0.85,
    keys: keys([
      [0, STAND],
      [0.4, SQUAT],
      [0.85, SIT],
    ]),
  },
  Sitting_Exit: {
    kind: "keys",
    duration: 0.75,
    keys: keys([
      [0, SIT],
      [0.35, SQUAT],
      [0.75, STAND],
    ]),
  },
  Waving: {
    kind: "keys",
    duration: 1.55,
    keys: keys([
      [0, STAND],
      [0.28, WAVE_UP],
      [0.5, WAVE_OUT],
      [0.72, WAVE_UP],
      [0.94, WAVE_OUT],
      [1.16, WAVE_UP],
      [1.55, STAND],
    ]),
  },
  Glaring: {
    kind: "keys",
    duration: 1.15,
    keys: keys([
      [0, STAND],
      [0.22, GLARE],
      [0.85, GLARE],
      [1.15, STAND],
    ]),
  },
};

/** Vertical reach of a hanging leg, measured under the ankle. */
function stanceReach(thigh: number, shin: number, foot: number) {
  return (
    BODY.thigh.h * Math.cos(thigh) +
    BODY.shin.h * Math.cos(thigh + shin) +
    BODY.foot.h * Math.cos(thigh + shin + foot)
  );
}

/** Thigh angle that puts the flat sole at a given forward offset from the hip. */
function thighForSoleZ(soleZ: number, shin: number) {
  const ankleZ = soleZ - BODY.foot.d * 0.22;
  const a = BODY.thigh.h + BODY.shin.h * Math.cos(shin);
  const b = BODY.shin.h * Math.sin(shin);
  const reach = Math.hypot(a, b);
  const clamped = Math.min(reach * 0.98, Math.max(-reach * 0.98, -ankleZ));
  return Math.asin(clamped / reach) - Math.atan2(b, a);
}

export function walkPose(phase: number): Pose {
  const twoPi = Math.PI * 2;
  const p = ((phase % twoPi) + twoPi) % twoPi;
  const rightStance = p < Math.PI;
  const u = (rightStance ? p : p - Math.PI) / Math.PI;
  const swing = Math.sin(p);
  const air = Math.sin(u * Math.PI) ** 1.25;
  const stanceZ = WALK_HALF_STRIDE * (1 - 2 * u);
  const swingZ = -stanceZ;
  const stanceShin = 6 * D;
  const swingShin = 6 * D + air * 34 * D;
  const shinL = rightStance ? swingShin : stanceShin;
  const shinR = rightStance ? stanceShin : swingShin;
  const thighL = thighForSoleZ(rightStance ? swingZ : stanceZ, shinL);
  const thighR = thighForSoleZ(rightStance ? stanceZ : swingZ, shinR);
  const footL = -(thighL + shinL) - (rightStance ? air * 5 * D : 0);
  const footR = -(thighR + shinR) - (rightStance ? 0 : air * 5 * D);
  const planted = rightStance
    ? stanceReach(thighR, shinR, footR)
    : stanceReach(thighL, shinL, footL);
  return {
    hipsY: planted - PLANT,
    hipsX: Math.cos(p * 2) * 1.1 * D,
    stance: rightStance ? "r" : "l",
    rot: {
      torso: [2 * D, swing * 2 * D, swing * 1.5 * D],
      head: [0, -swing * 2 * D, 0],
      thigh_l: [thighL, 0, -2 * D],
      shin_l: [shinL, 0, 0],
      foot_l: [footL, 0, 0],
      thigh_r: [thighR, 0, 2 * D],
      shin_r: [shinR, 0, 0],
      foot_r: [footR, 0, 0],
      upperarm_l: [-swing * 8 * D, 0, 12 * D],
      lowerarm_l: [-10 * D - (rightStance ? 0 : air) * 6 * D, 0, 0],
      upperarm_r: [swing * 8 * D, 0, -12 * D],
      lowerarm_r: [-10 * D - (rightStance ? air : 0) * 6 * D, 0, 0],
    },
  };
}

export function mergePose(base: Pose, overlay: Pose): Pose {
  return {
    hipsY: overlay.hipsY ?? base.hipsY,
    hipsX: overlay.hipsX ?? base.hipsX,
    rot: { ...base.rot, ...overlay.rot },
  };
}

export function sampleKeys(clip: Extract<ClipDef, { kind: "keys" }>, time: number): Pose {
  const keys = clip.keys;
  if (keys.length === 0) return STAND;
  if (time <= keys[0].t) return mergePose(STAND, keys[0].pose);
  const last = keys[keys.length - 1];
  if (time >= last.t) return mergePose(STAND, last.pose);
  let i = 1;
  while (i < keys.length && time > keys[i].t) i += 1;
  const a = keys[i - 1];
  const b = keys[i];
  const u = (time - a.t) / Math.max(1e-5, b.t - a.t);
  return lerpPose(mergePose(STAND, a.pose), mergePose(STAND, b.pose), smooth(u));
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const rot: JointMap = { ...a.rot };
  const ids = new Set([...Object.keys(a.rot), ...Object.keys(b.rot)]) as Set<JointId>;
  for (const id of ids) {
    const ae = a.rot[id] ?? [0, 0, 0];
    const be = b.rot[id] ?? [0, 0, 0];
    rot[id] = [
      ae[0] + (be[0] - ae[0]) * t,
      ae[1] + (be[1] - ae[1]) * t,
      ae[2] + (be[2] - ae[2]) * t,
    ];
  }
  return {
    hipsY: (a.hipsY ?? HIP_HEIGHT) + ((b.hipsY ?? HIP_HEIGHT) - (a.hipsY ?? HIP_HEIGHT)) * t,
    hipsX: (a.hipsX ?? 0) + ((b.hipsX ?? 0) - (a.hipsX ?? 0)) * t,
    rot,
  };
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
