import { queryParam } from "./dev";

/** Day (kraft cardboard) and night (cool) palettes. Mix with the viewer's local clock. */

export type Palette = {
  void: string;
  ambient: string;
  ambientIntensity: number;
  hint: string;
  hintAlpha: number;
  hintShadow: string;
  lamp: {
    light: string;
    halo: string;
    bulb: string;
    glow: string;
    intensity: number;
    haloIntensity: number;
    emissive: number;
  };
  room: {
    floor: string;
    wall: string;
    ceiling: string;
    back: string;
  };
  body: {
    paper: string;
    tone: string;
  };
  wood: {
    tone: string;
    seat: string;
    fallback: string;
  };
};

/** Day: kraft cardboard and straw lamp light. */
export const day: Palette = {
  void: "#060504",
  ambient: "#19150f",
  ambientIntensity: 0.07,
  hint: "#d0c2a4",
  hintAlpha: 0.42,
  hintShadow: "#000000",
  lamp: {
    light: "#eee2c6",
    halo: "#f0e6ce",
    bulb: "#e6d4a4",
    glow: "#c9ae70",
    intensity: 92,
    haloIntensity: 7,
    emissive: 2.1,
  },
  room: {
    floor: "#5c4e34",
    wall: "#3e3424",
    ceiling: "#241e14",
    back: "#332a1c",
  },
  body: {
    paper: "#efe6d6",
    tone: "#e4d8c4",
  },
  wood: {
    tone: "#e4d0ac",
    seat: "#ead9b8",
    fallback: "#c4a574",
  },
};

/** Night: cool moonlight. */
export const night: Palette = {
  void: "#020305",
  ambient: "#121820",
  ambientIntensity: 0.04,
  hint: "#a8bad2",
  hintAlpha: 0.45,
  hintShadow: "#000000",
  lamp: {
    light: "#c5d4ea",
    halo: "#d0dceb",
    bulb: "#e8eef6",
    glow: "#9eb4d0",
    intensity: 70,
    haloIntensity: 6,
    emissive: 1.6,
  },
  room: {
    floor: "#3d4550",
    wall: "#1a1f27",
    ceiling: "#10141a",
    back: "#161b22",
  },
  body: {
    paper: "#d5dce4",
    tone: "#c2cad4",
  },
  wood: {
    tone: "#c4ccd4",
    seat: "#d0d6de",
    fallback: "#8a929c",
  },
};

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

function smoothstep(t: number) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

function parseHex(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number) {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function lerpHex(a: string, b: string, t: number) {
  const A = parseHex(a);
  const B = parseHex(b);
  return toHex(
    Math.round(lerp(A.r, B.r, t)),
    Math.round(lerp(A.g, B.g, t)),
    Math.round(lerp(A.b, B.b, t)),
  );
}

/**
 * 1 = full day, 0 = full night, in the viewer's local timezone.
 * Dawn ~5:30–8:00, dusk ~18:00–20:30.
 * In dev, pass ?hour=13 or ?hour=1 to preview day or night.
 */
export function dayAmount(now = new Date()) {
  let h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const raw = queryParam("hour");
  const override = raw == null ? Number.NaN : Number.parseFloat(raw);
  if (Number.isFinite(override)) h = ((override % 24) + 24) % 24;
  if (h >= 8 && h < 18) return 1;
  if (h >= 20.5 || h < 5.5) return 0;
  if (h < 8) return smoothstep((h - 5.5) / 2.5);
  return 1 - smoothstep((h - 18) / 2.5);
}

export function mixPalette(amount = dayAmount()): Palette {
  const t = clamp01(amount);
  return {
    void: lerpHex(night.void, day.void, t),
    ambient: lerpHex(night.ambient, day.ambient, t),
    ambientIntensity: lerp(night.ambientIntensity, day.ambientIntensity, t),
    hint: lerpHex(night.hint, day.hint, t),
    hintAlpha: lerp(night.hintAlpha, day.hintAlpha, t),
    hintShadow: lerpHex(night.hintShadow, day.hintShadow, t),
    lamp: {
      light: lerpHex(night.lamp.light, day.lamp.light, t),
      halo: lerpHex(night.lamp.halo, day.lamp.halo, t),
      bulb: lerpHex(night.lamp.bulb, day.lamp.bulb, t),
      glow: lerpHex(night.lamp.glow, day.lamp.glow, t),
      intensity: lerp(night.lamp.intensity, day.lamp.intensity, t),
      haloIntensity: lerp(night.lamp.haloIntensity, day.lamp.haloIntensity, t),
      emissive: lerp(night.lamp.emissive, day.lamp.emissive, t),
    },
    room: {
      floor: lerpHex(night.room.floor, day.room.floor, t),
      wall: lerpHex(night.room.wall, day.room.wall, t),
      ceiling: lerpHex(night.room.ceiling, day.room.ceiling, t),
      back: lerpHex(night.room.back, day.room.back, t),
    },
    body: {
      paper: lerpHex(night.body.paper, day.body.paper, t),
      tone: lerpHex(night.body.tone, day.body.tone, t),
    },
    wood: {
      tone: lerpHex(night.wood.tone, day.wood.tone, t),
      seat: lerpHex(night.wood.seat, day.wood.seat, t),
      fallback: lerpHex(night.wood.fallback, day.wood.fallback, t),
    },
  };
}

export function hexInt(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

export function applyTheme(palette = mixPalette()) {
  const { r, g, b } = parseHex(palette.hint);
  const root = document.documentElement;
  root.style.setProperty("--void", palette.void);
  root.style.setProperty("--hint", `rgba(${r}, ${g}, ${b}, ${palette.hintAlpha})`);
  root.style.setProperty("--hint-shadow", palette.hintShadow);
}
