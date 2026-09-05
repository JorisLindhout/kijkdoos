import { Vector3, type Group } from "three";
import { BODY, HIP_HEIGHT, JOINT_IDS, type BlockPerson } from "./blockBody";
import type { PlayOpts, WalkContact } from "./Controller";
import {
  CLIPS,
  STAND,
  lerpPose,
  sampleKeys,
  walkPose,
  type Pose,
} from "./poses";

const PLANT = 0.02;
const _sole = new Vector3();
const _local = new Vector3();

function soleY(joint: Group) {
  joint.updateWorldMatrix(true, false);
  _sole.set(0, -BODY.foot.h, BODY.foot.d * 0.22).applyMatrix4(joint.matrixWorld);
  return _sole.y;
}

export class PosePlayer {
  private time = 0;
  private clip = "Stand_Still";
  private loop = false;
  private paused = false;
  private scale = 1;
  private finished = false;
  private fade = 0;
  private fadeFrom: Pose = STAND;
  onFinished: (() => void) | null = null;

  constructor(private readonly person: BlockPerson) {
    this.apply(STAND);
  }

  play(name: string, loop: boolean, opts?: PlayOpts) {
    const def = CLIPS[name];
    if (!def) return;
    this.fadeFrom = this.currentPose();
    this.clip = name;
    this.loop = loop;
    this.paused = false;
    this.finished = false;
    this.scale = opts?.reverse ? -1 : 1;
    this.fade = opts?.fade ?? 0.16;
    if (opts?.hold === "end") this.time = def.duration;
    else if (opts?.reverse) this.time = def.duration;
    else this.time = 0;
    if (opts?.hold === "start") this.time = 0;
    if (opts?.hold) {
      this.paused = true;
      this.fade = 0;
      this.apply(this.poseAt(this.time));
    }
  }

  update(dt: number) {
    const def = CLIPS[this.clip];
    if (!def) return;
    if (!this.paused) {
      this.time += dt * this.scale;
      if (this.loop) {
        const dur = Math.max(def.duration, 1e-4);
        this.time = ((this.time % dur) + dur) % dur;
      } else if (!this.finished) {
        if (this.scale >= 0 && this.time >= def.duration) {
          this.time = def.duration;
          this.finished = true;
          this.onFinished?.();
        } else if (this.scale < 0 && this.time <= 0) {
          this.time = 0;
          this.finished = true;
          this.onFinished?.();
        }
      }
    }
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt);
    const pose = this.poseAt(this.time);
    if (this.fade > 0) {
      const u = 1 - this.fade / 0.16;
      this.apply(lerpPose(this.fadeFrom, pose, Math.min(1, Math.max(0, u))));
      return;
    }
    this.apply(pose);
  }

  walkContact(): WalkContact | null {
    const def = CLIPS[this.clip];
    if (!def || def.kind !== "walk") return null;
    const pose = this.poseAt(this.time);
    const side = pose.stance;
    if (!side) return null;
    const { root, joints } = this.person;
    const foot = side === "l" ? joints.foot_l : joints.foot_r;
    root.updateWorldMatrix(true, true);
    _sole.set(0, -BODY.foot.h, BODY.foot.d * 0.22).applyMatrix4(foot.matrixWorld);
    _local.copy(_sole);
    root.worldToLocal(_local);
    return { side, x: _local.x, z: _local.z };
  }

  private poseAt(time: number): Pose {
    const def = CLIPS[this.clip];
    if (!def) return STAND;
    if (def.kind === "walk") {
      return walkPose((time / def.duration) * Math.PI * 2);
    }
    return sampleKeys(def, time);
  }

  private currentPose(): Pose {
    return this.poseAt(this.time);
  }

  private apply(pose: Pose) {
    const { hips, joints } = this.person;
    hips.position.y = pose.hipsY ?? hips.position.y;
    hips.rotation.x = pose.hipsX ?? 0;
    for (const id of JOINT_IDS) {
      const e = pose.rot[id] ?? [0, 0, 0];
      joints[id].rotation.set(e[0], e[1], e[2]);
    }
    if ((pose.hipsY ?? HIP_HEIGHT) < HIP_HEIGHT * 0.75) return;
    const lowest = Math.min(soleY(joints.foot_l), soleY(joints.foot_r));
    hips.position.y += -PLANT - lowest;
  }
}
