import type { ActionName, CatalogObject, Plan, Snapshot } from "../brain/schema";
import { CLIP, HOLD_END, HOLD_START } from "./clips";
import {
  chairStandPoint,
  randomClearFloor,
  resolveFloor,
  routeAroundChair,
  stepHitsChair,
  type FloorXZ,
} from "../scene/nav";
import { floorPoint, type ShoeboxMetrics } from "../scene/shoebox";
import { CHAIR_ID, CHAIR_SEAT_HEIGHT, CHAIR_SIZE, CHAIR_U, CHAIR_V } from "../scene/ChairBox";

export const THOUGHT_CAP = 40;
export const ACTOR_LOGIC = 27;

export type WalkContact = {
  side: "l" | "r";
  x: number;
  z: number;
};

export type ActorPose = "idle" | "walk" | "sit" | "wave" | "glare";

export type PlayOpts = {
  reverse?: boolean;
  hold?: "start" | "end";
  fade?: number;
};

export type PlayClip = (clip: string, loop: boolean, opts?: PlayOpts) => void;

type Walk = {
  x: number;
  z: number;
  then?: () => void;
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
  private afterOneShot: (() => void) | null = null;
  private started = false;

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
    this.stillStand();
  }

  private stillStand() {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.pose = "idle";
    this.play?.(CLIP.idle, false, HOLD_START);
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
    this.lookingAtUser = false;
    this.request(plan, metrics);
  }

  request(plan: Plan, metrics: ShoeboxMetrics) {
    this.record(plan.action);
    switch (plan.action) {
      case "walk_to":
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
      case "emote":
        this.oneShot(CLIP.glare, "glare");
        break;
      case "fidget":
      case "look_at_user":
        if (!this.seated && !this.walk) this.stillStand();
        break;
      default:
        if (!this.walk && !this.seated) this.stillStand();
    }
  }

  clickFloor(point: { x: number; z: number }, metrics: ShoeboxMetrics) {
    this.lookingAtUser = false;
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
      this.play?.(CLIP.sit, false, { ...HOLD_END, fade: 0 });
      return;
    }
    this.stillStand();
  }

  walkBusy() {
    return this.walk !== null || this.pose === "walk";
  }

  tick(dt: number, metrics: ShoeboxMetrics, contact?: WalkContact | null) {
    this.energy = Math.min(1, Math.max(0.05, this.energy - 0.008 * dt));
    if (!this.walk) return;
    const dx = this.walk.x - this.x;
    const dz = this.walk.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      this.x = this.walk.x;
      this.z = this.walk.z;
      const nextHop = this.path.shift();
      if (nextHop) {
        this.walk = { x: nextHop.x, z: nextHop.z, then: this.walk.then };
        this.footLock = null;
        return;
      }
      const then = this.walk.then;
      this.walk = null;
      this.footLock = null;
      if (then) then();
      else this.stillStand();
      return;
    }
    this.yaw = Math.atan2(dx, dz);
    const prevX = this.x;
    const prevZ = this.z;
    if (contact) this.stepFromFoot(contact);
    else return;
    if (stepHitsChair(prevX, prevZ, this.x, this.z, metrics)) {
      this.x = prevX;
      this.z = prevZ;
      this.stillStand();
      return;
    }
    const [rx, , rz] = resolveFloor(this.x, this.z, metrics);
    const intended = Math.hypot(this.x - prevX, this.z - prevZ);
    const along =
      intended > 1e-6
        ? ((rx - prevX) * (this.x - prevX) + (rz - prevZ) * (this.z - prevZ)) / intended
        : 0;
    this.x = rx;
    this.z = rz;
    this.y = 0;
    if (intended > 0.003 && along < 0.0015) this.stillStand();
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
    then?: () => void,
    preferFront = false,
  ) {
    const beginWalk = () => {
      this.seated = false;
      this.y = 0;
      const [sx, , sz] = resolveFloor(this.x, this.z, metrics);
      this.x = sx;
      this.z = sz;
      const [x, , z] = resolveFloor(point[0], point[2], metrics);
      const hops = routeAroundChair({ x: this.x, z: this.z }, { x, z }, metrics, preferFront);
      const first = hops.shift();
      this.footLock = null;
      this.path = hops;
      this.walk = first ? { x: first.x, z: first.z, then } : { x, z, then };
      if (Math.hypot(this.walk.x - this.x, this.walk.z - this.z) < 0.05 && this.path.length === 0) {
        this.walk = null;
        if (then) then();
        else this.stillStand();
        return;
      }
      this.pose = "walk";
      this.play?.(CLIP.walk, true, { fade: 0 });
    };
    if (this.seated) {
      this.play?.(CLIP.stand, false);
      this.seated = false;
      this.afterOneShot = beginWalk;
      return;
    }
    beginWalk();
  }

  private sit(metrics: ShoeboxMetrics) {
    if (this.seated) return;
    this.goTo(
      chairStandPoint(metrics),
      metrics,
      () => {
        const [cx, , cz] = floorPoint(metrics, CHAIR_U, CHAIR_V);
        this.x = cx;
        this.z = cz + CHAIR_SIZE[2] * 0.28;
        this.yaw = 0;
        this.seated = true;
        this.pose = "sit";
        this.play?.(CLIP.sit, false);
      },
      true,
    );
  }

  private stand() {
    if (!this.seated) return;
    this.play?.(CLIP.stand, false);
    this.seated = false;
    this.pose = "idle";
    this.afterOneShot = () => this.stillStand();
  }

  private oneShot(clip: string, pose: ActorPose) {
    if (this.seated) return;
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.pose = pose;
    this.play?.(clip, false);
  }

  private walkTarget(plan: Plan, metrics: ShoeboxMetrics): [number, number, number] {
    if (plan.target === CHAIR_ID) return chairStandPoint(metrics);
    return randomClearFloor(metrics);
  }

  private keepInRoom(metrics: ShoeboxMetrics) {
    if (this.seated) return;
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

export function catalogObjects(metrics: ShoeboxMetrics): CatalogObject[] {
  const chair = floorPoint(metrics, CHAIR_U, CHAIR_V);
  return [
    {
      id: CHAIR_ID,
      kind: "chair",
      affordances: ["sit"],
      pos: chair,
      yaw: 0,
      seatHeight: CHAIR_SEAT_HEIGHT,
    },
  ];
}
