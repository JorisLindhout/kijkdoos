import type { ActionName, CatalogObject, Plan, Snapshot } from "../brain/schema";
import { CLIP, HOLD_START } from "./clips";
import { BODY } from "./blockBody";
import { STAND_DURATION, TURN_DURATION } from "./poses";
import {
  backReachable,
  behindChair,
  canReachPoint,
  chairBackPoint,
  chairKickPoint,
  chairStandPoint,
  canWalkAway,
  clampWalls,
  kickFacesOut,
  onChairBack,
  overlapsChair,
  randomClearFloor,
  resolveBehindChair,
  resolveFloor,
  routeAroundChair,
  stepHitsChair,
  type FloorXZ,
} from "../scene/nav";
import {
  CHAIR_ID,
  CHAIR_SEAT_HEIGHT,
  chairLive,
  chairSitPoint,
  defaultChairUV,
  getBadChair,
  getChairUV,
  getLightOn,
  kickSlideFrom,
  lerpChairUV,
  pushAwayFromWall,
  pushChairUV,
  randomChairUV,
  rememberBadChair,
  setChairUV,
  setLightOn,
  yankCord,
  type ChairUV,
} from "../scene/furniture";
import { floorPoint, remapFloor, type ShoeboxMetrics } from "../scene/shoebox";
import {
  getLiveMood,
  getFailCount,
  getVisitSummary,
  noteVisitFail,
  noteVisitPoke,
  noteVisitSit,
  persistFurnitureNow,
} from "../visit";

export const THOUGHT_CAP = 40;
export const ACTOR_LOGIC = 67;
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
  | "turn"
  | "pull"
  | "grip"
  | "kick";

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
  private pendingLamp = false;
  private pendingChair = false;
  private pendingChairTo: { to: ChairUV; kind: "push" | "move" } | null = null;
  private pendingKick = false;
  private kickTries = 0;
  private contactWalkTries = 0;
  private afterKick: "push" | "move" | "recover" | "spite" | null = null;
  private recoverTries = 0;
  private lastMetrics: ShoeboxMetrics | null = null;
  private started = false;
  private hold = 0;
  private afterHold: (() => void) | null = null;
  private afterTurn: (() => void) | null = null;
  private quiet = 0;
  private chairTween: {
    from: ChairUV;
    to: ChairUV;
    t: number;
    duration: number;
    follow: boolean;
  } | null = null;
  private failedAt = new Map<string, string>();

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
    this.lastMetrics = metrics;
    this.holdStill();
  }

  /** Keep floor UV when the shoebox morphs; seated snaps to the chair. */
  relayout(prev: ShoeboxMetrics, next: ShoeboxMetrics) {
    this.lastMetrics = next;
    if (prev.width === next.width && prev.depth === next.depth) return;
    const map = (x: number, z: number) => remapFloor(prev, next, x, z);
    const here = map(this.x, this.z);
    this.x = here.x;
    this.z = here.z;
    this.y = 0;
    if (this.walk) {
      const to = map(this.walk.x, this.walk.z);
      this.walk.x = to.x;
      this.walk.z = to.z;
    }
    this.path = this.path.map((hop) => map(hop.x, hop.z));
    if (this.footLock) {
      const foot = map(this.footLock.x, this.footLock.z);
      this.footLock.x = foot.x;
      this.footLock.z = foot.z;
    }
    if (this.turning) {
      const plant = map(this.turning.plantX, this.turning.plantZ);
      this.turning.plantX = plant.x;
      this.turning.plantZ = plant.z;
    }
    if (this.step) {
      const from = map(this.step.x0, this.step.z0);
      const to = map(this.step.x1, this.step.z1);
      this.step.x0 = from.x;
      this.step.z0 = from.z;
      this.step.x1 = to.x;
      this.step.z1 = to.z;
    }
    if (this.sitPlant) this.sitPlant = map(this.sitPlant.x, this.sitPlant.z);
    if (this.seated) {
      this.snapToSeat(next);
      return;
    }
    if (this.chairTween) return;
    if (this.pendingSit && this.walk) {
      this.goTo(chairStandPoint(next), next, () => this.prepareSit(), true);
      return;
    }
    if (this.pendingChair && this.walk && this.pendingKick) {
      const at = chairKickPoint(next, { x: this.x, z: this.z });
      this.goTo(at, next, () => this.startKick(), false, behindChair(at[0], at[2], next));
      return;
    }
    if (this.pendingChair && this.walk && this.pendingChairTo) {
      const dest = this.pendingChairTo;
      this.goTo(chairBackPoint(next), next, () => this.contactThenTween(dest.to, dest.kind), false, true);
      return;
    }
    this.keepInRoom(next);
  }

  private stillStand() {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.sitPlant = null;
    this.chairTween = null;
    this.afterOneShot = null;
    this.afterHold = null;
    this.afterTurn = null;
    this.hold = 0;
    this.pendingSit = false;
    this.pendingLamp = false;
    this.pendingChair = false;
    this.pendingChairTo = null;
    this.pendingKick = false;
    this.afterKick = null;
    this.recoverTries = 0;
    this.kickTries = 0;
    this.contactWalkTries = 0;
    this.lookingAtUser = false;
    this.quiet = 0;
    this.pose = "idle";
    this.play?.(CLIP.idle, true, { fade: 0.18 });
  }

  snapshot(metrics: ShoeboxMetrics): Snapshot {
    const summary = getVisitSummary();
    const mood = getLiveMood();
    return {
      sceneVersion: this.sceneVersion,
      objects: catalogObjects(metrics),
      character: {
        pose: this.pose,
        mood,
        energy: this.energy,
        pos: [this.x, 0, this.z],
      },
      lastActions: this.lastActions.slice(-8),
      user: {
        stareSeconds: this.stareSeconds,
        poked: this.poked,
      },
      mood,
      visitCount: summary.visitCount,
      lightOn: getLightOn(),
      visitSummary: summary,
      failedActions: this.failedNow(metrics),
      trappedChair: this.isTrapped(metrics),
      backBlocked: !backReachable(metrics),
      failCount: getFailCount(),
      badChairPoses: getBadChair(),
    };
  }

  applyPlan(plan: Plan, metrics: ShoeboxMetrics) {
    const ids = new Set(catalogObjects(metrics).map((o) => o.id));
    if (plan.target && !ids.has(plan.target)) {
      return;
    }
    if (this.failedNow(metrics).includes(plan.action)) {
      const trapped = this.isTrapped(metrics) || !backReachable(metrics);
      if (!(plan.action === "kick_chair" && trapped)) return;
    }
    this.lookingAtUser = plan.action === "look_at_user";
    if (plan.action === "move_chair" && (this.isTrapped(metrics) || !backReachable(metrics))) {
      this.request({ action: "kick_chair" }, metrics);
      return;
    }
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
      case "push_chair":
        if (!this.pushChair(metrics)) this.noteFail("push_chair");
        break;
      case "move_chair":
        if (!this.moveChair(metrics)) this.noteFail("move_chair");
        break;
      case "kick_chair":
        if (!this.kickChair(metrics)) this.noteFail("kick_chair");
        break;
      case "light_on":
        this.pullLamp(true, metrics);
        break;
      case "light_off":
        this.pullLamp(false, metrics);
        break;
      default:
        if (this.seated) this.playSitIdle();
        else if (!this.walk) this.stillStand();
    }
  }

  clickFloor(point: { x: number; z: number }, metrics: ShoeboxMetrics) {
    this.lookingAtUser = false;
    this.pendingSit = false;
    this.pendingLamp = false;
    this.pendingChair = false;
    this.pendingChairTo = null;
    this.pendingKick = false;
    this.goTo([point.x, 0, point.z], metrics);
    this.record("walk_to");
  }

  clickChair(metrics: ShoeboxMetrics) {
    this.sit(metrics);
    this.record("sit");
  }

  clickCharacter() {
    this.poked = true;
    noteVisitPoke();
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
      this.pendingLamp ||
      this.pendingChair ||
      this.pendingKick ||
      this.recoverTries > 0 ||
      this.walk !== null ||
      this.chairTween !== null ||
      this.pose === "walk" ||
      this.pose === "wave" ||
      this.pose === "glare" ||
      this.pose === "fidget" ||
      this.pose === "look" ||
      this.pose === "emote" ||
      this.pose === "pull" ||
      this.pose === "grip" ||
      this.pose === "kick" ||
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
    if (
      !this.seated &&
      !this.pendingSit &&
      !this.chairTween &&
      !this.walk &&
      overlapsChair(this.x, this.z, metrics)
    ) {
      this.keepInRoom(metrics);
    }
    if (this.chairTween) {
      this.advanceChairTween(dt, metrics);
      return;
    }
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
    const toSit = this.pendingSit;
    if (!toSit && stepHitsChair(prevX, prevZ, this.x, this.z, metrics)) {
      this.x = prevX;
      this.z = prevZ;
      this.stopWalk();
      return;
    }
    const [rx, , rz] = toSit
      ? wallOnly(this.x, this.z, metrics)
      : this.pendingChair && !this.pendingKick && behindChair(this.x, this.z, metrics)
        ? resolveBehindChair(this.x, this.z, metrics)
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
    preferBack = false,
  ) {
    const beginWalk = () => {
      this.seated = false;
      this.y = 0;
      this.quiet = 0;
      this.turning = null;
      this.step = null;
      this.sitPlant = null;
      this.chairTween = null;
      this.afterOneShot = null;
      this.afterTurn = null;
      this.afterHold = null;
      this.hold = 0;
      const [sx, , sz] =
        preferBack && behindChair(this.x, this.z, metrics)
          ? resolveBehindChair(this.x, this.z, metrics)
          : resolveFloor(this.x, this.z, metrics);
      this.x = sx;
      this.z = sz;
      let x = point[0];
      let z = point[2];
      if (!onArrive) {
        const resolved = resolveFloor(x, z, metrics);
        x = resolved[0];
        z = resolved[2];
      } else if (preferBack) {
        const resolved = resolveBehindChair(x, z, metrics);
        x = resolved[0];
        z = resolved[2];
      } else {
        const walls = clampWalls(x, z, metrics);
        x = walls.x;
        z = walls.z;
      }
      const hops = routeAroundChair(
        { x: this.x, z: this.z },
        { x, z },
        metrics,
        preferFront,
        preferBack,
      );
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
    this.pendingLamp = false;
    this.pendingChair = false;
    this.pendingChairTo = null;
    this.pendingKick = false;
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
    this.faceThen(getChairUV().yaw, () => {
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
    this.yaw = getChairUV().yaw;
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
      this.yaw = getChairUV().yaw;
      this.pendingSit = false;
      noteVisitSit();
      this.playSitIdle();
    };
  }

  private nearStand(metrics: ShoeboxMetrics) {
    const [sx, , sz] = chairStandPoint(metrics);
    return Math.hypot(this.x - sx, this.z - sz) < 0.22;
  }

  private nearBack(metrics: ShoeboxMetrics) {
    const [bx, , bz] = chairBackPoint(metrics);
    return (
      Math.hypot(this.x - bx, this.z - bz) < 0.32 &&
      (onChairBack(this.x, this.z, metrics) || behindChair(this.x, this.z, metrics))
    );
  }

  private nearKick(metrics: ShoeboxMetrics) {
    const [kx, , kz] = chairKickPoint(metrics, { x: this.x, z: this.z });
    return Math.hypot(this.x - kx, this.z - kz) < 0.42;
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
      this.yaw = getChairUV().yaw;
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
    this.pendingLamp = false;
    this.pendingChair = false;
    this.pendingChairTo = null;
    this.pendingKick = false;
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
    this.pendingLamp = false;
    this.pendingChair = false;
    this.pendingChairTo = null;
    this.pendingKick = false;
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
    this.yaw = getChairUV().yaw;
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
    this.pendingLamp = false;
    this.pendingChair = false;
    this.pendingChairTo = null;
    this.pendingKick = false;
    this.lookingAtUser = false;
    this.quiet = STILL_MIN + Math.random() * (STILL_MAX - STILL_MIN);
    if (this.seated) {
      this.pose = "sit";
      this.yaw = getChairUV().yaw;
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
    if (this.pendingKick && this.lastMetrics) {
      if (this.canKickHere(this.lastMetrics)) this.startKick();
      else if (this.contactWalkTries++ < 2) {
        const at = chairKickPoint(this.lastMetrics, { x: this.x, z: this.z });
        this.goTo(at, this.lastMetrics, () => this.startKick(), false, behindChair(at[0], at[2], this.lastMetrics));
      } else if (this.isTrapped(this.lastMetrics) || kickFacesOut(this.x, this.z, this.lastMetrics)) {
        this.startKick();
      } else this.stillStand();
      return;
    }
    if (this.pendingChair && this.pendingChairTo && this.lastMetrics) {
      const dest = this.pendingChairTo;
      if (this.nearBack(this.lastMetrics) || onChairBack(this.x, this.z, this.lastMetrics)) {
        this.contactWalkTries = 0;
        this.contactThenTween(dest.to, dest.kind);
      } else if (this.contactWalkTries++ < 2) {
        this.goTo(
          chairBackPoint(this.lastMetrics),
          this.lastMetrics,
          () => this.contactThenTween(dest.to, dest.kind),
          false,
          true,
        );
      } else {
        this.kickChair(this.lastMetrics, dest.kind);
      }
      return;
    }
    if (this.lastMetrics && this.isTrapped(this.lastMetrics)) {
      if (!this.kickChair(this.lastMetrics, "recover")) this.stillStand();
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
    if (this.pendingChair || this.pendingKick || this.pendingSit || this.pendingLamp) {
      return false;
    }
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

  private pullLamp(on: boolean, metrics: ShoeboxMetrics) {
    if (this.seated) {
      this.stand(() => this.pullLamp(on, metrics));
      return;
    }
    this.pendingLamp = true;
    const [x, , z] = lampPullPoint(metrics);
    if (Math.hypot(this.x - x, this.z - z) < 0.22) {
      this.beginPull(on);
      return;
    }
    this.goTo([x, 0, z], metrics, () => this.beginPull(on));
  }

  private beginPull(on: boolean) {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.quiet = 0;
    this.pendingLamp = true;
    this.pose = "pull";
    this.play?.(CLIP.pull, false, { fade: 0.12 });
    this.hold = 0.5;
    this.afterHold = () => {
      yankCord();
      setLightOn(on);
      persistFurnitureNow();
    };
    this.afterOneShot = () => {
      this.pendingLamp = false;
      this.stillStand();
    };
  }

  private pushChair(metrics: ShoeboxMetrics, recover = false) {
    if (this.seated) {
      this.stand(() => {
        if (!this.pushChair(metrics, recover)) this.noteFail("push_chair");
      });
      return true;
    }
    if (!backReachable(metrics) || this.isTrapped(metrics)) {
      return this.kickChair(metrics, recover ? "recover" : "push");
    }
    const next = recover
      ? pushAwayFromWall(metrics)
      : (pushChairUV(metrics) ?? pushAwayFromWall(metrics));
    if (!next) return false;
    this.failedAt.delete("push_chair");
    this.pendingSit = false;
    this.pendingLamp = false;
    this.pendingChair = true;
    this.pendingKick = false;
    this.pendingChairTo = { to: next, kind: "push" };
    this.goTo(chairBackPoint(metrics), metrics, () => this.contactThenTween(next, "push"), false, true);
    return true;
  }

  private moveChair(metrics: ShoeboxMetrics) {
    if (this.seated) {
      this.stand(() => {
        if (!this.moveChair(metrics)) this.noteFail("move_chair");
      });
      return true;
    }
    if (!backReachable(metrics) || this.isTrapped(metrics)) {
      return this.kickChair(metrics, "move");
    }
    const next = randomChairUV(metrics);
    if (!next) return false;
    this.failedAt.delete("move_chair");
    this.pendingSit = false;
    this.pendingLamp = false;
    this.pendingChair = true;
    this.pendingKick = false;
    this.pendingChairTo = { to: next, kind: "move" };
    this.goTo(chairBackPoint(metrics), metrics, () => this.contactThenTween(next, "move"), false, true);
    return true;
  }

  private kickChair(metrics: ShoeboxMetrics, after: "push" | "move" | "recover" | "spite" = "spite") {
    if (this.seated) {
      this.stand(() => {
        if (!this.kickChair(metrics, after)) this.noteFail("kick_chair");
      });
      return true;
    }
    this.failedAt.delete("kick_chair");
    this.pendingSit = false;
    this.pendingLamp = false;
    this.afterKick = after;
    this.pendingChair = true;
    this.pendingKick = true;
    const at = chairKickPoint(metrics, { x: this.x, z: this.z });
    const preferBack = behindChair(at[0], at[2], metrics);
    if (this.canKickHere(metrics)) {
      return this.beginKick();
    }
    if (
      !this.isTrapped(metrics) &&
      canReachPoint({ x: this.x, z: this.z }, { x: at[0], z: at[2] }, metrics, preferBack)
    ) {
      this.goTo(at, metrics, () => this.startKick(), false, preferBack);
      return true;
    }
    if (kickFacesOut(this.x, this.z, metrics) || this.isTrapped(metrics)) {
      return this.beginKick();
    }
    this.goTo(at, metrics, () => this.startKick(), false, preferBack);
    return true;
  }

  private canKickHere(metrics: ShoeboxMetrics) {
    if (this.nearKick(metrics) || onChairBack(this.x, this.z, metrics)) {
      return kickFacesOut(this.x, this.z, metrics) || behindChair(this.x, this.z, metrics);
    }
    return false;
  }

  private startKick() {
    if (!this.beginKick()) this.stillStand();
  }

  private roomState() {
    const c = getChairUV();
    return `${c.u.toFixed(3)},${c.v.toFixed(3)},${c.yaw.toFixed(2)},${getLightOn() ? 1 : 0},${this.seated ? 1 : 0}`;
  }

  private noteFail(action: ActionName) {
    this.failedAt.set(action, this.roomState());
    noteVisitFail();
  }

  private failedNow(_metrics: ShoeboxMetrics) {
    const key = this.roomState();
    const out: string[] = [];
    for (const [action, when] of this.failedAt) {
      if (when === key) out.push(action);
      else this.failedAt.delete(action);
    }
    return out;
  }

  private contactThenTween(to: ChairUV, kind: "push" | "move") {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.afterTurn = null;
    this.pendingChair = true;
    this.pendingKick = false;
    const metrics = this.lastMetrics;
    if (metrics) {
      const [bx, , bz] = chairBackPoint(metrics);
      const [x, , z] = resolveBehindChair(bx, bz, metrics);
      this.x = x;
      this.z = z;
      this.y = 0;
      if (overlapsChair(x, z, metrics)) {
        this.kickChair(metrics, kind);
        return;
      }
    }
    this.yaw = wrapPi(getChairUV().yaw);
    this.beginGrip(to, kind);
  }

  private beginGrip(to: ChairUV, kind: "push" | "move") {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.quiet = 0;
    this.pendingChair = true;
    this.pose = "grip";
    this.play?.(CLIP.grip, false, { fade: 0.12 });
    this.afterOneShot = () => this.beginChairTween(to, kind);
    if (!this.play) this.beginChairTween(to, kind);
  }

  private beginKick() {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.quiet = 0;
    this.pendingKick = true;
    this.pendingChair = true;
    const metrics = this.lastMetrics;
    const dist = this.kickTries > 2 ? 0.7 : this.kickTries > 0 ? 0.52 : undefined;
    const slide = metrics ? kickSlideFrom(metrics, this.x, this.z, dist) : null;
    if (!slide) {
      this.pendingKick = false;
      this.pendingChair = false;
      this.pendingChairTo = null;
      return false;
    }
    this.pendingChairTo = { to: slide, kind: "push" };
    const live = metrics ? chairLive(metrics) : null;
    if (live) this.yaw = wrapPi(Math.atan2(live.x - this.x, live.z - this.z));
    this.pose = "kick";
    this.play?.(CLIP.chairKick, false, { fade: 0.1 });
    this.hold = 0.34;
    this.afterHold = () => {
      const to = this.pendingChairTo?.to;
      if (!to) return;
      this.chairTween = {
        from: getChairUV(),
        to,
        t: 0,
        duration: 0.4,
        follow: false,
      };
    };
    this.afterOneShot = () => {
      if (this.chairTween) return;
      this.finishKick();
    };
    return true;
  }

  private beginChairTween(to: ChairUV, kind: "push" | "move") {
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.quiet = 0;
    this.pendingChair = true;
    this.chairTween = {
      from: getChairUV(),
      to,
      t: 0,
      duration: 1,
      follow: true,
    };
    this.pose = "grip";
    this.play?.(kind === "push" ? CLIP.chairPush : CLIP.chairMove, true, { fade: 0.08 });
  }

  private advanceChairTween(dt: number, metrics: ShoeboxMetrics) {
    const tw = this.chairTween;
    if (!tw) return;
    tw.t += dt;
    const u = smoothstep(Math.min(1, tw.t / tw.duration));
    setChairUV(lerpChairUV(tw.from, tw.to, u), metrics);
    if (tw.follow) {
      const [sx, , sz] = chairBackPoint(metrics);
      const [x, , z] = resolveBehindChair(sx, sz, metrics);
      this.x = x;
      this.z = z;
      this.yaw = wrapPi(getChairUV().yaw);
      this.y = 0;
    } else {
      const [x, , z] = resolveFloor(this.x, this.z, metrics);
      this.x = x;
      this.z = z;
      this.y = 0;
    }
    if (u >= 1) {
      this.chairTween = null;
      persistFurnitureNow();
      if (this.pendingKick) {
        this.finishKick();
        return;
      }
      this.pendingChair = false;
      this.pendingChairTo = null;
      this.finishChairMove(metrics);
    }
  }

  private finishKick() {
    const metrics = this.lastMetrics;
    this.pendingKick = false;
    if (!metrics) {
      this.stillStand();
      return;
    }
    persistFurnitureNow();
    const after = this.afterKick;
    if (backReachable(metrics) && !this.isTrapped(metrics)) {
      this.kickTries = 0;
      this.recoverTries = 0;
      if (after === "push") {
        if (!this.pushChair(metrics)) this.stillStand();
        return;
      }
      if (after === "move") {
        if (!this.moveChair(metrics)) this.stillStand();
        return;
      }
      if (after === "recover") {
        if (!this.pushChair(metrics, true)) this.stillStand();
        return;
      }
      this.stillStand();
      return;
    }
    rememberBadChair(getChairUV());
    persistFurnitureNow();
    this.kickTries += 1;
    this.record("kick_chair");
    if (this.kickTries > 8) {
      this.kickTries = 0;
      this.recoverTries = 0;
      this.afterKick = null;
      this.stillStand();
      return;
    }
    if (this.kickTries > 6) {
      if (!this.kickTowardDefault(metrics)) {
        this.kickTries = 0;
        this.recoverTries = 0;
        this.afterKick = null;
        this.stillStand();
      }
      return;
    }
    if (!this.kickChair(metrics, after ?? "spite")) {
      if (!this.kickTowardDefault(metrics)) {
        this.kickTries = 0;
        this.stillStand();
      }
    }
  }

  private kickTowardDefault(metrics: ShoeboxMetrics) {
    const safe = defaultChairUV(metrics);
    const live = chairLive(metrics);
    const [sx, , sz] = floorPoint(metrics, safe.u, safe.v);
    const mx = sx - live.x;
    const mz = sz - live.z;
    if (Math.hypot(mx, mz) < 0.16) return false;
    const kx = live.x - this.x;
    const kz = live.z - this.z;
    const klen = Math.hypot(kx, kz);
    const mlen = Math.hypot(mx, mz);
    if (klen > 1e-4 && mlen > 1e-4 && (mx * kx + mz * kz) / (mlen * klen) < -0.15) {
      return false;
    }
    this.afterKick = "recover";
    this.pendingChair = true;
    this.pendingKick = true;
    this.pendingChairTo = { to: safe, kind: "push" };
    const liveNow = chairLive(metrics);
    this.yaw = wrapPi(Math.atan2(liveNow.x - this.x, liveNow.z - this.z));
    this.walk = null;
    this.path = [];
    this.footLock = null;
    this.turning = null;
    this.step = null;
    this.quiet = 0;
    this.pose = "kick";
    this.play?.(CLIP.chairKick, false, { fade: 0.1 });
    this.hold = 0.34;
    this.afterHold = () => {
      const to = this.pendingChairTo?.to;
      if (!to) return;
      this.chairTween = {
        from: getChairUV(),
        to,
        t: 0,
        duration: 0.45,
        follow: false,
      };
    };
    this.afterOneShot = () => {
      if (this.chairTween) return;
      this.finishKick();
    };
    return true;
  }

  private finishChairMove(metrics: ShoeboxMetrics) {
    const [bx, , bz] = chairBackPoint(metrics);
    const [x, , z] = resolveBehindChair(bx, bz, metrics);
    this.x = x;
    this.z = z;
    this.y = 0;
    this.yaw = wrapPi(getChairUV().yaw);
    if (!this.isTrapped(metrics) && backReachable(metrics)) {
      this.recoverTries = 0;
      this.kickTries = 0;
      this.stillStand();
      return;
    }
    rememberBadChair(getChairUV());
    persistFurnitureNow();
    this.recoverTries += 1;
    this.noteFail("move_chair");
    this.record("kick_chair");
    if (this.recoverTries > 8) {
      if (!this.kickTowardDefault(metrics) && !this.kickChair(metrics, "recover")) {
        this.recoverTries = 0;
        this.kickTries = 0;
        this.stillStand();
      }
      return;
    }
    if (!this.kickChair(metrics, "recover")) {
      if (!this.kickTowardDefault(metrics)) this.stillStand();
    }
  }

  private isTrapped(metrics: ShoeboxMetrics) {
    if (this.seated) return false;
    return !canWalkAway(this.x, this.z, metrics);
  }

  private keepInRoom(metrics: ShoeboxMetrics) {
    if (this.seated || this.pendingSit) return;
    const [x, , z] = resolveFloor(this.x, this.z, metrics);
    this.x = x;
    this.z = z;
    this.y = 0;
  }

  private snapToSeat(metrics: ShoeboxMetrics) {
    const [x, , z] = chairSitPoint(metrics);
    this.x = x;
    this.z = z;
    this.y = 0;
    this.yaw = getChairUV().yaw;
    if (this.lastSoles) {
      this.sitPlant = offsetWorld(
        this.x,
        this.z,
        this.yaw,
        this.lastSoles.x,
        this.lastSoles.z,
      );
    }
  }

  private record(action: ActionName | string) {
    this.lastActions.push(action);
    if (this.lastActions.length > 16) this.lastActions.shift();
  }
}

function lampPullPoint(metrics: ShoeboxMetrics): [number, number, number] {
  return resolveFloor(metrics.width / 2, -metrics.depth / 2, metrics);
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
  const live = chairLive(metrics);
  return [
    {
      id: CHAIR_ID,
      kind: "chair",
      affordances: ["sit"],
      pos: [live.x, 0, live.z],
      yaw: live.yaw,
      seatHeight: CHAIR_SEAT_HEIGHT,
    },
  ];
}
