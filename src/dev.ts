/** True while `vite` / `npm run dev` is running. Production builds stay closed. */
export const DEV = import.meta.env.DEV;

export const DEV_MOUSE = [
  ["click floor", "walk there"],
  ["click chair", "sit"],
  ["click character", "glare"],
  ["hover canvas", "count as staring"],
] as const;

export const DEV_KEYS = [
  ["W", "wave"],
  ["G", "glare"],
  ["F", "fidget"],
  ["L", "look at you"],
  ["E", "emote (shrug)"],
  ["I", "still"],
  ["S", "sit"],
  ["X", "stand (when seated)"],
  ["O", "toggle lamp"],
  ["P", "push chair"],
  ["M", "move chair"],
] as const;

export const DEV_QUERY = [
  ["hour", "preview local hour 0–24, e.g. ?hour=13 (day) or ?hour=1 (night)"],
] as const;

export function queryParam(name: string): string | null {
  if (!DEV || typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

let logged = false;

export function logDevCheatsheet() {
  if (!DEV || logged) return;
  logged = true;
  const lines = [
    "kijkdoos · dev commands",
    "",
    "Mouse",
    ...DEV_MOUSE.map(([cmd, note]) => `  ${cmd} — ${note}`),
    "",
    "Keys",
    ...DEV_KEYS.map(([key, note]) => `  ${key} — ${note}`),
    "",
    "Query",
    ...DEV_QUERY.map(([name, note]) => `  ?${name} — ${note}`),
  ];
  console.info(lines.join("\n"));
}
