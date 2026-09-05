export const ACTIONS = [
  "idle",
  "fidget",
  "walk_to",
  "sit",
  "stand",
  "wave",
  "glare",
  "look_at_user",
  "emote",
] as const;

export type ActionName = (typeof ACTIONS)[number];

export type CatalogObject = {
  id: string;
  kind: string;
  affordances: string[];
  pos: [number, number, number];
  yaw?: number;
  seatHeight?: number;
};

export type Snapshot = {
  sceneVersion: number;
  objects: CatalogObject[];
  character: {
    pose: string;
    mood?: string;
    energy?: number;
    pos: [number, number, number];
  };
  lastActions: string[];
  user: {
    stareSeconds?: number;
    poked?: boolean;
  };
};

export type Plan = {
  action: ActionName;
  target?: string;
  mood?: string;
  say?: string;
};

export function isActionName(value: string): value is ActionName {
  return (ACTIONS as readonly string[]).includes(value);
}
