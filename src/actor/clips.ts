import type { ActionName } from "../brain/schema";

export const CLIP = {
  idle: "Stand_Still",
  fidget: "Stand_Still",
  walk: "Walk_Loop",
  sit: "Sitting_Enter",
  sitIdle: "Sitting_Enter",
  stand: "Sitting_Exit",
  wave: "Waving",
  glare: "Glaring",
  turnLeft: "Turn_Left",
  turnRight: "Turn_Right",
} as const;

export const HOLD_START = { hold: "start" as const };
export const HOLD_END = { hold: "end" as const };

export type ClipId = (typeof CLIP)[keyof typeof CLIP];

export function clipForAction(action: ActionName): { clip: ClipId; loop: boolean } | null {
  switch (action) {
    case "idle":
    case "fidget":
    case "look_at_user":
      return { clip: CLIP.idle, loop: false };
    case "walk_to":
      return { clip: CLIP.walk, loop: true };
    case "sit":
      return { clip: CLIP.sit, loop: false };
    case "stand":
      return { clip: CLIP.stand, loop: false };
    case "wave":
      return { clip: CLIP.wave, loop: false };
    case "glare":
    case "emote":
      return { clip: CLIP.glare, loop: false };
    default:
      return null;
  }
}
