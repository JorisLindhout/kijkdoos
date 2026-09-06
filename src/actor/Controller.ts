import type { ActionName, CatalogObject, Plan, Snapshot } from "../brain/schema";
import { CLIP, HOLD_START } from "./clips";
import { BODY } from "./blockBody";
import { STAND_DURATION, TURN_DURATION } from "./poses";
import {
  chairStandPoint,
  clampWalls,
  randomClearFloor,
  resolveFloor,
  routeAroundChair,
  stepHitsChair,
  type FloorXZ,
} from "../scene/nav";
import { floorPoint, type ShoeboxMetrics } from "../scene/shoebox";
import {
  CHAIR_ID,
  CHAIR_SEAT_HEIGHT,
  CHAIR_YAW,
  chairPos,
} from "../scene/ChairBox";

export const THOUGHT_CAP = 40;
export const ACTOR_LOGIC = 54;
const STILL_MIN = 6;
const STILL_MAX = 24;
const TURN_THRESH = Math.PI * 0.55;
const YAW_FOLLOW = 9;
const PIVOT_X = BODY.torso.w / 2 - BODY.thigh.w / 2;

export type WalkContact = {
  side: "l" | "r";
  x: number;
  z: number;
};

export type ActorPose =
  | "idle"
  | "still"
  | "walk"
  | "sit"
  | "wave"
  | "glare"
  | "fidget"
  | "look"
  | "emote"
  | "turn";

export type PlayOpts = {
  reverse?: boolean;
  hold?: "start" | "end";
  fade?: number;
};

export type PlayClip = (clip: string, loop: boolean, opts?: PlayOpts) => void;

type Walk = {
  x: number;
  z: number;
  onArrive?: () => void;
};

type Step = {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  delay: number;
  duration: number;
  t: number;
};

type Turn = {
  from: number;
  to: number;
  duration: number;
  t: number;
  plantX: number;
  plantZ: number;
  localX: number;
  localZ: number;
};

export class Controller {
  logic = ACTOR_LOGIC;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  pose: ActorPose = "idle";
  seated = false;
  lookingAtUser = false;
  lastActions: string[] = [];
  sceneVersion = 1;
  thoughts = 0;
  energy = 0.72;
  stareSeconds = 0;
  poked = false;
  play: PlayClip | null = null;
  private walk: Walk | null = null;
  private path: FloorXZ[] = [];
  private footLock: { side: "l" | "r"; x: number; z: number } | null = null;
  private turning: Turn | null = null;
  private step: Step | null = null;
  private sitPlant: FloorXZ | null = null;
  private lastSoles: FloorXZ | null = null;
  private afterOneShot: (() => void) | null = null;
  private pendingSit = false;
  private lastMetrics: ShoeboxMetrics | null = null;
  private started = false;
  private hold = 0;
  private afterHold: (() => void) | null = null;
  private afterTurn: (() => void) | null = null;
  private quiet = 0;

  start(metrics: ShoeboxMetrics) {
    if (this.started) {
      this.keepInRoom(metrics);
      return;
    }
    this.started = true;
    const spawn = floorPoint(metrics, 0.5, 0.45);
    const [x, , z] = resolveFloor(spawn[0], spawn[2], metrics);
    this.x = x;
    this.z = z;
    this.yaw = 0;
    this.y = 0;
    this.holdStill();
  }

  private stillStand() {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.sitPlant = null;
    this.afterOneShot = null;
    this.afterHold = null;
    this.afterTurn = null;
    this.hold = 0;
    this.pendingSit = false;
    this.lookingAtUser = false;
    this.quiet = 0;
    this.pose = "idle";
    this.play?.(CLIP.idle, true, { fade: 0.18 });
  }

  snapshot(metrics: ShoeboxMetrics): Snapshot {
    return {
      sceneVersion: this.sceneVersion,
      objects: catalogObjects(metrics),
      character: {
        pose: this.pose,
        energy: this.energy,
        pos: [this.x, 0, this.z],
      },
      lastActions: this.lastActions.slice(-8),
      user: {
        stareSeconds: this.stareSeconds,
        poked: this.poked,
      },
    };
  }

  applyPlan(plan: Plan, metrics: ShoeboxMetrics) {
    const ids = new Set(catalogObjects(metrics).map((o) => o.id));
    if (plan.target && !ids.has(plan.target)) {
      return;
    }
    this.lookingAtUser = plan.action === "look_at_user";
    this.request(plan, metrics);
  }

  request(plan: Plan, metrics: ShoeboxMetrics) {
    this.record(plan.action);
    switch (plan.action) {
      case "walk_to":
        this.pendingSit = false;
        this.goTo(this.walkTarget(plan, metrics), metrics);
        break;
      case "sit":
        this.sit(metrics);
        break;
      case "stand":
        this.stand();
        break;
      case "wave":
        this.oneShot(CLIP.wave, "wave");
        break;
      case "glare":
        this.oneShot(CLIP.glare, "glare");
        break;
      case "emote":
        this.emote();
        break;
      case "fidget":
        this.fidget();
        break;
      case "look_at_user":
        this.lookAtUser(metrics);
        break;
      case "still":
        this.holdStill();
        break;
      default:
        if (this.seated) this.playSitIdle();
        else if (!this.walk) this.stillStand();
    }
  }

  clickFloor(point: { x: number; z: number }, metrics: ShoeboxMetrics) {
    this.lookingAtUser = false;
    this.pendingSit = false;
    this.goTo([point.x, 0, point.z], metrics);
    this.record("walk_to");
  }

  clickChair(metrics: ShoeboxMetrics) {
    this.sit(metrics);
    this.record("sit");
  }

  clickCharacter() {
    this.poked = true;
    this.oneShot(CLIP.glare, "glare");
    this.record("glare");
  }

  onClipFinished() {
    const next = this.afterOneShot;
    this.afterOneShot = null;
    if (next) {
      next();
      return;
    }
    if (this.seated) {
      this.playSitIdle();
      return;
    }
    this.stillStand();
  }

  walkBusy() {
    return (
      this.quiet > 0 ||
      this.pendingSit ||
      this.walk !== null ||
      this.pose === "walk" ||
      this.pose === "wave" ||
      this.pose === "glare" ||
      this.pose === "fidget" ||
      this.pose === "look" ||
      this.pose === "emote" ||
      this.turning !== null ||
      this.step !== null ||
      this.hold > 0
    );
  }

  tick(dt: number, metrics: ShoeboxMetrics, contact?: WalkContact | null, soles?: FloorXZ | null) {
    this.lastMetrics = metrics;
    if (soles) this.lastSoles = soles;
    this.energy = Math.min(1, Math.max(0.05, this.energy - 0.008 * dt));
    if (this.quiet > 0) this.quiet = Math.max(0, this.quiet - dt);
    if (this.step) {
      this.advanceStep(dt);
      return;
    }
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) {
        this.hold = 0;
        const next = this.afterHold;
        this.afterHold = null;
        next?.();
      }
      return;
    }
    if (this.sitPlant && this.lastSoles) {
      this.anchorToPlant(this.sitPlant, this.lastSoles);
      return;
    }
    if (this.turning) {
      this.advanceTurn(dt);
      if (!this.pendingSit) this.keepInRoom(metrics);
      return;
    }
    if (!this.walk) return;
    const dx = this.walk.x - this.x;
    const dz = this.walk.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      this.x = this.walk.x;
      this.z = this.walk.z;
      const nextHop = this.path.shift();
      if (nextHop) {
        this.walk = { x: nextHop.x, z: nextHop.z, onArrive: this.walk.onArrive };
        this.footLock = null;
        this.maybeTurn();
        return;
      }
      const onArrive = this.walk.onArrive;
      this.walk = null;
      this.footLock = null;
      if (onArrive) onArrive();
      else this.stillStand();
      return;
    }
    if (this.maybeTurn()) return;
    this.yaw = wrapPi(
      lerpAngle(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-YAW_FOLLOW * dt)),
    );
    const prevX = this.x;
    const prevZ = this.z;
    if (contact) this.stepFromFoot(contact);
    else return;
    const toSit = Boolean(this.walk.onArrive);
    if (!toSit && stepHitsChair(prevX, prevZ, this.x, this.z, metrics)) {
      this.x = prevX;
      this.z = prevZ;
      this.stopWalk();
      return;
    }
    const [rx, , rz] = toSit
      ? wallOnly(this.x, this.z, metrics)
      : resolveFloor(this.x, this.z, metrics);
    const intended = Math.hypot(this.x - prevX, this.z - prevZ);
    const along =
      intended > 1e-6
        ? ((rx - prevX) * (this.x - prevX) + (rz - prevZ) * (this.z - prevZ)) / intended
        : 0;
    this.x = rx;
    this.z = rz;
    this.y = 0;
    if (intended > 0.003 && along < 0.0015) this.stopWalk();
  }

  private stepFromFoot(contact: WalkContact) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const worldX = this.x + contact.x * c + contact.z * s;
    const worldZ = this.z - contact.x * s + contact.z * c;
    if (!this.footLock || this.footLock.side !== contact.side) {
      this.footLock = { side: contact.side, x: worldX, z: worldZ };
      return;
    }
    this.x = this.footLock.x - (contact.x * c + contact.z * s);
    this.z = this.footLock.z - (-contact.x * s + contact.z * c);
  }

  private goTo(
    point: [number, number, number],
    metrics: ShoeboxMetrics,
    onArrive?: () => void,
    preferFront = false,
  ) {
    const beginWalk = () => {
      this.seated = false;
      this.y = 0;
      this.quiet = 0;
      this.turning = null;
      this.step = null;
      this.sitPlant = null;
      this.afterOneShot = null;
      const [sx, , sz] = resolveFloor(this.x, this.z, metrics);
      this.x = sx;
      this.z = sz;
      let x = point[0];
      let z = point[2];
      if (!onArrive) {
        const resolved = resolveFloor(x, z, metrics);
        x = resolved[0];
        z = resolved[2];
      } else {
        const walls = clampWalls(x, z, metrics);
        x = walls.x;
        z = walls.z;
      }
      const hops = routeAroundChair({ x: this.x, z: this.z }, { x, z }, metrics, preferFront);
      const first = hops.shift();
      this.footLock = null;
      this.path = hops;
      this.walk = first ? { x: first.x, z: first.z, onArrive } : { x, z, onArrive };
      if (Math.hypot(this.walk.x - this.x, this.walk.z - this.z) < 0.05 && this.path.length === 0) {
        this.walk = null;
        if (onArrive) onArrive();
        else this.stillStand();
        return;
      }
      this.pose = "walk";
      if (this.maybeTurn()) return;
      this.play?.(CLIP.walk, true, { fade: 0 });
    };
    if (this.seated) {
      this.stand(beginWalk);
      return;
    }
    beginWalk();
  }

  private sit(metrics: ShoeboxMetrics) {
    if (this.seated) return;
    this.lastMetrics = metrics;
    this.pendingSit = true;
    this.quiet = 0;
    this.turning = null;
    this.footLock = null;
    if (this.nearStand(metrics)) {
      this.prepareSit();
      return;
    }
    this.goTo(chairStandPoint(metrics), metrics, () => this.prepareSit(), true);
  }

  private prepareSit() {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.pendingSit = true;
    this.pose = "idle";
    this.play?.(CLIP.still, false, HOLD_START);
    this.faceThen(CHAIR_YAW, () => {
      this.hold = 0.18;
      this.afterHold = () => this.beginSitDown();
    });
  }

  private beginSitDown() {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.seated = true;
    this.yaw = CHAIR_YAW;
    this.pose = "sit";
    if (this.lastSoles) {
      this.sitPlant = offsetWorld(
        this.x,
        this.z,
        this.yaw,
        this.lastSoles.x,
        this.lastSoles.z,
      );
    }
    this.play?.(CLIP.sit, false, { fade: 0 });
    this.afterOneShot = () => {
      this.yaw = CHAIR_YAW;
      this.pendingSit = false;
      this.playSitIdle();
    };
  }

  private nearStand(metrics: ShoeboxMetrics) {
    const [sx, , sz] = chairStandPoint(metrics);
    return Math.hypot(this.x - sx, this.z - sz) < 0.22;
  }

  private stand(onStood?: () => void) {
    if (!this.seated) return;
    const metrics = this.lastMetrics;
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.sitPlant = null;
    this.quiet = 0;
    this.play?.(CLIP.stand, false);
    this.pose = "idle";
    if (metrics) {
      const [x, , z] = chairStandPoint(metrics);
      this.startStep(x, z, 0.28, STAND_DURATION - 0.28);
    }
    this.afterOneShot = () => {
      this.seated = false;
      this.step = null;
      this.yaw = CHAIR_YAW;
      if (metrics) {
        const [x, , z] = chairStandPoint(metrics);
        this.x = x;
        this.z = z;
      }
      if (onStood) onStood();
      else this.stillStand();
    };
  }

  private oneShot(clip: string, pose: ActorPose) {
    if (this.seated) return;
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.sitPlant = null;
    this.afterOneShot = null;
    this.afterHold = null;
    this.afterTurn = null;
    this.hold = 0;
    this.pendingSit = false;
    this.quiet = 0;
    this.pose = pose;
    this.play?.(clip, false);
  }

  private fidget() {
    if (this.seated) {
      this.seatedShot(CLIP.sitFidget, "fidget");
      return;
    }
    this.oneShot(CLIP.fidget, "fidget");
  }

  private emote() {
    if (this.seated) {
      this.seatedShot(CLIP.sitFidget, "emote");
      return;
    }
    this.oneShot(CLIP.emote, "emote");
  }

  private lookAtUser(metrics: ShoeboxMetrics) {
    this.lookingAtUser = true;
    if (this.seated) {
      this.seatedShot(CLIP.sitLook, "look");
      return;
    }
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.sitPlant = null;
    this.pendingSit = false;
    this.afterOneShot = null;
    this.afterHold = null;
    this.afterTurn = null;
    this.hold = 0;
    this.quiet = 0;
    const heading = Math.atan2(metrics.width / 2 - this.x, metrics.camDist - this.z);
    this.faceThen(heading, () => {
      this.pose = "look";
      this.play?.(CLIP.look, false);
    });
  }

  private seatedShot(clip: string, pose: ActorPose) {
    this.afterOneShot = null;
    this.afterHold = null;
    this.afterTurn = null;
    this.hold = 0;
    this.quiet = 0;
    this.pose = pose;
    this.play?.(clip, false);
    this.afterOneShot = () => this.playSitIdle();
  }

  private playSitIdle() {
    this.pendingSit = false;
    this.pose = "sit";
    this.yaw = CHAIR_YAW;
    this.play?.(CLIP.sitIdle, true, { fade: 0.18 });
  }

  private holdStill() {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.afterOneShot = null;
    this.afterHold = null;
    this.afterTurn = null;
    this.hold = 0;
    this.pendingSit = false;
    this.lookingAtUser = false;
    this.quiet = STILL_MIN + Math.random() * (STILL_MAX - STILL_MIN);
    if (this.seated) {
      this.pose = "sit";
      this.yaw = CHAIR_YAW;
      this.play?.(CLIP.sitStill, true, { fade: 0.18 });
      return;
    }
    this.sitPlant = null;
    this.pose = "still";
    this.play?.(CLIP.still, true, { fade: 0.18 });
  }

  private stopWalk() {
    if (this.pendingSit && this.lastMetrics && this.nearStand(this.lastMetrics)) {
      this.prepareSit();
      return;
    }
    this.stillStand();
  }

  private anchorToPlant(plant: FloorXZ, soles: FloorXZ) {
    const root = offsetRoot(plant.x, plant.z, this.yaw, soles.x, soles.z);
    this.x = root.x;
    this.z = root.z;
    this.y = 0;
  }

  private startStep(x1: number, z1: number, delay: number, duration: number) {
    if (Math.hypot(x1 - this.x, z1 - this.z) < 0.01) {
      this.step = null;
      return;
    }
    this.step = {
      x0: this.x,
      z0: this.z,
      x1,
      z1,
      delay,
      duration: Math.max(0.05, duration),
      t: 0,
    };
  }

  private advanceStep(dt: number) {
    const step = this.step;
    if (!step) return;
    step.t += dt;
    if (step.t < step.delay) return;
    const u = smoothstep(Math.min(1, (step.t - step.delay) / step.duration));
    this.x = step.x0 + (step.x1 - step.x0) * u;
    this.z = step.z0 + (step.z1 - step.z0) * u;
    this.y = 0;
    if (u >= 1) {
      this.x = step.x1;
      this.z = step.z1;
      this.step = null;
    }
  }

  private maybeTurn() {
    if (!this.walk || this.turning) return false;
    const dist = Math.hypot(this.walk.x - this.x, this.walk.z - this.z);
    if (dist < 0.55) return false;
    const heading = Math.atan2(this.walk.x - this.x, this.walk.z - this.z);
    const from = wrapPi(this.yaw);
    const delta = wrapPi(heading - from);
    if (Math.abs(delta) < TURN_THRESH) return false;
    const localX = delta > 0 ? -PIVOT_X : PIVOT_X;
    const localZ = BODY.foot.d * 0.05;
    const plant = offsetWorld(this.x, this.z, from, localX, localZ);
    this.yaw = from;
    this.turning = {
      from,
      to: from + delta,
      duration: TURN_DURATION,
      t: 0,
      plantX: plant.x,
      plantZ: plant.z,
      localX,
      localZ,
    };
    this.footLock = null;
    this.pose = "turn";
    this.play?.(delta > 0 ? CLIP.turnLeft : CLIP.turnRight, false, { fade: 0.1 });
    this.afterOneShot = () => this.finishTurn();
    return true;
  }

  private advanceTurn(dt: number) {
    const turn = this.turning;
    if (!turn) return;
    turn.t += dt;
    const u = smoothstep(Math.min(1, turn.t / turn.duration));
    this.yaw = turn.from + (turn.to - turn.from) * u;
    const root = offsetRoot(turn.plantX, turn.plantZ, this.yaw, turn.localX, turn.localZ);
    this.x = root.x;
    this.z = root.z;
    this.y = 0;
  }

  private finishTurn() {
    const turn = this.turning;
    this.turning = null;
    if (turn) {
      this.yaw = wrapPi(turn.to);
      const root = offsetRoot(turn.plantX, turn.plantZ, this.yaw, turn.localX, turn.localZ);
      this.x = root.x;
      this.z = root.z;
    }
    const next = this.afterTurn;
    this.afterTurn = null;
    if (next) {
      next();
      return;
    }
    if (!this.walk) {
      this.stillStand();
      return;
    }
    this.pose = "walk";
    this.footLock = null;
    this.play?.(CLIP.walk, true, { fade: 0.08 });
  }

  private faceThen(yaw: number, then: () => void) {
    const from = wrapPi(this.yaw);
    const delta = wrapPi(yaw - from);
    if (Math.abs(delta) < 0.12) {
      this.yaw = wrapPi(yaw);
      then();
      return;
    }
    this.yaw = from;
    this.turning = {
      from,
      to: from + delta,
      duration: TURN_DURATION,
      t: 0,
      plantX: this.x,
      plantZ: this.z,
      localX: 0,
      localZ: 0,
    };
    this.footLock = null;
    this.pose = "turn";
    this.afterTurn = then;
    this.play?.(delta > 0 ? CLIP.turnLeft : CLIP.turnRight, false, { fade: 0.1 });
    this.afterOneShot = () => this.finishTurn();
  }

  private walkTarget(plan: Plan, metrics: ShoeboxMetrics): [number, number, number] {
    if (plan.target === CHAIR_ID) return chairStandPoint(metrics);
    return randomClearFloor(metrics);
  }

  private keepInRoom(metrics: ShoeboxMetrics) {
    if (this.seated || this.pendingSit) return;
    const [x, , z] = resolveFloor(this.x, this.z, metrics);
    this.x = x;
    this.z = z;
    this.y = 0;
  }

  private record(action: ActionName | string) {
    this.lastActions.push(action);
    if (this.lastActions.length > 16) this.lastActions.shift();
  }
}

function wallOnly(
  x: number,
  z: number,
  metrics: ShoeboxMetrics,
): [number, number, number] {
  const walls = clampWalls(x, z, metrics);
  return [walls.x, 0, walls.z];
}

function wrapPi(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngle(from: number, to: number, t: number) {
  return from + wrapPi(to - from) * Math.min(1, Math.max(0, t));
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function offsetWorld(x: number, z: number, yaw: number, localX: number, localZ: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: x + localX * c + localZ * s,
    z: z - localX * s + localZ * c,
  };
}

function offsetRoot(plantX: number, plantZ: number, yaw: number, localX: number, localZ: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: plantX - (localX * c + localZ * s),
    z: plantZ - (-localX * s + localZ * c),
  };
}

export function catalogObjects(metrics: ShoeboxMetrics): CatalogObject[] {
  const chair = chairPos(metrics);
  return [
    {
      id: CHAIR_ID,
      kind: "chair",
      affordances: ["sit"],
      pos: chair,
      yaw: CHAIR_YAW,
      seatHeight: CHAIR_SEAT_HEIGHT,
    },
  ];
}
