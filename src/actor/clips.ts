import type { ActionName } from "../brain/schema";

export const CLIP = {
  idle: "Living_Idle",
  still: "Stand_Still",
  fidget: "Fidget",
  walk: "Walk_Loop",
  sit: "Sitting_Enter",
  sitIdle: "Sitting_Idle",
  sitStill: "Sitting_Still",
  sitFidget: "Sitting_Fidget",
  sitLook: "Sitting_Look",
  stand: "Sitting_Exit",
  wave: "Waving",
  glare: "Glaring",
  look: "Look_At_User",
  emote: "Shrug",
  pull: "Pull_Cord",
  grip: "Chair_Grip",
  chairPush: "Chair_Push",
  chairMove: "Chair_Move",
  turnLeft: "Turn_Left",
  turnRight: "Turn_Right",
} as const;

export const HOLD_START = { hold: "start" as const };
export const HOLD_END = { hold: "end" as const };

export type ClipId = (typeof CLIP)[keyof typeof CLIP];

export function clipForAction(action: ActionName): { clip: ClipId; loop: boolean } | null {
  switch (action) {
    case "idle":
      return { clip: CLIP.idle, loop: true };
    case "still":
      return { clip: CLIP.still, loop: true };
    case "fidget":
      return { clip: CLIP.fidget, loop: false };
    case "look_at_user":
      return { clip: CLIP.look, loop: false };
    case "walk_to":
      return { clip: CLIP.walk, loop: true };
    case "sit":
      return { clip: CLIP.sit, loop: false };
    case "stand":
      return { clip: CLIP.stand, loop: false };
    case "wave":
      return { clip: CLIP.wave, loop: false };
    case "glare":
      return { clip: CLIP.glare, loop: false };
    case "emote":
      return { clip: CLIP.emote, loop: false };
    case "light_on":
    case "light_off":
      return { clip: CLIP.pull, loop: false };
    case "push_chair":
      return { clip: CLIP.chairPush, loop: true };
    case "move_chair":
      return { clip: CLIP.chairMove, loop: true };
    default:
      return null;
  }
}
