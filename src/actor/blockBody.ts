import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { hexInt, mixPalette, type Palette } from "../theme";

/** Adult block person, ~1.69 m. Sizes are meters. */
export const BODY = {
  head: { w: 0.2, h: 0.22, d: 0.18 },
  neck: { w: 0.08, h: 0.06, d: 0.07 },
  torso: { w: 0.34, h: 0.52, d: 0.16 },
  upperArm: { w: 0.085, h: 0.28, d: 0.085 },
  forearm: { w: 0.08, h: 0.25, d: 0.08 },
  hand: { w: 0.07, h: 0.08, d: 0.045 },
  thigh: { w: 0.1, h: 0.42, d: 0.1 },
  shin: { w: 0.09, h: 0.4, d: 0.09 },
  foot: { w: 0.09, h: 0.07, d: 0.2 },
} as const;

export const HIP_HEIGHT = BODY.foot.h + BODY.shin.h + BODY.thigh.h;
export const STAND_HEIGHT =
  HIP_HEIGHT + BODY.torso.h + BODY.neck.h + BODY.head.h;
/** Bump so Resident rebuilds the rig after bind changes. */
export const RIG = 6;

export const JOINT_IDS = [
  "torso",
  "neck",
  "head",
  "upperarm_l",
  "lowerarm_l",
  "hand_l",
  "upperarm_r",
  "lowerarm_r",
  "hand_r",
  "thigh_l",
  "shin_l",
  "foot_l",
  "thigh_r",
  "shin_r",
  "foot_r",
] as const;

export type JointId = (typeof JOINT_IDS)[number];

export type BlockPerson = {
  root: Group;
  hips: Group;
  joints: Record<JointId, Group>;
};

type BodyRole = "paper" | "tone";

function boxMesh(
  w: number,
  h: number,
  d: number,
  color: number,
  y: number,
  z: number,
  role: BodyRole,
) {
  const mesh = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(0, y, z);
  mesh.userData.role = role;
  return mesh;
}

function hang(w: number, h: number, d: number, color: number, role: BodyRole) {
  return boxMesh(w, h, d, color, -h / 2, 0, role);
}

export function tintPerson(root: Group, palette: Palette) {
  const paper = hexInt(palette.body.paper);
  const tone = hexInt(palette.body.tone);
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const mat = obj.material;
    if (!(mat instanceof MeshStandardMaterial)) return;
    if (obj.userData.role === "tone") mat.color.setHex(tone);
    else if (obj.userData.role === "paper") mat.color.setHex(paper);
  });
}

export function createBlockPerson(): BlockPerson {
  const palette = mixPalette();
  const paper = hexInt(palette.body.paper);
  const tone = hexInt(palette.body.tone);
  const { head, neck, torso, upperArm, forearm, hand, thigh, shin, foot } = BODY;
  const hipX = torso.w / 2 - thigh.w / 2;

  const root = new Group();
  const hips = new Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);

  const torsoJ = new Group();
  hips.add(torsoJ);
  torsoJ.add(boxMesh(torso.w, torso.h, torso.d, tone, torso.h / 2, 0, "tone"));

  const neckJ = new Group();
  neckJ.position.y = torso.h;
  torsoJ.add(neckJ);
  neckJ.add(boxMesh(neck.w, neck.h, neck.d, paper, neck.h / 2, 0, "paper"));

  const headJ = new Group();
  headJ.position.y = neck.h;
  neckJ.add(headJ);
  headJ.add(boxMesh(head.w, head.h, head.d, paper, head.h / 2, 0, "paper"));

  function arm(side: 1 | -1) {
    const upper = new Group();
    upper.position.set(
      side * (torso.w / 2 + upperArm.w / 2 + 0.025),
      torso.h - 0.03,
      0.02,
    );
    torsoJ.add(upper);
    upper.add(hang(upperArm.w, upperArm.h, upperArm.d, paper, "paper"));

    const lower = new Group();
    lower.position.y = -upperArm.h;
    upper.add(lower);
    lower.add(hang(forearm.w, forearm.h, forearm.d, paper, "paper"));

    const handJ = new Group();
    handJ.position.y = -forearm.h;
    lower.add(handJ);
    handJ.add(hang(hand.w, hand.h, hand.d, tone, "tone"));
    return { upper, lower, handJ };
  }

  function leg(side: 1 | -1) {
    const thighJ = new Group();
    thighJ.position.set(side * hipX, 0, 0);
    hips.add(thighJ);
    thighJ.add(hang(thigh.w, thigh.h, thigh.d, paper, "paper"));

    const shinJ = new Group();
    shinJ.position.y = -thigh.h;
    thighJ.add(shinJ);
    shinJ.add(hang(shin.w, shin.h, shin.d, paper, "paper"));

    const footJ = new Group();
    footJ.position.y = -shin.h;
    shinJ.add(footJ);
    footJ.add(boxMesh(foot.w, foot.h, foot.d, tone, -foot.h / 2, foot.d * 0.22, "tone"));
    return { thighJ, shinJ, footJ };
  }

  const leftArm = arm(1);
  const rightArm = arm(-1);
  const leftLeg = leg(1);
  const rightLeg = leg(-1);

  const joints: Record<JointId, Group> = {
    torso: torsoJ,
    neck: neckJ,
    head: headJ,
    upperarm_l: leftArm.upper,
    lowerarm_l: leftArm.lower,
    hand_l: leftArm.handJ,
    upperarm_r: rightArm.upper,
    lowerarm_r: rightArm.lower,
    hand_r: rightArm.handJ,
    thigh_l: leftLeg.thighJ,
    shin_l: leftLeg.shinJ,
    foot_l: leftLeg.footJ,
    thigh_r: rightLeg.thighJ,
    shin_r: rightLeg.shinJ,
    foot_r: rightLeg.footJ,
  };

  return { root, hips, joints };
}
