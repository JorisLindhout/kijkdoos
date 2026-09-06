import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { usePalette } from "../useTheme";
import { type ShoeboxMetrics } from "./shoebox";

export const CHAIR_ID = "chair-1";
/** Seat top. Matches a sitting adult’s shin + foot. */
export const CHAIR_SEAT_HEIGHT = 0.47;
/** Square seat: width and depth equal the seat height. */
export const CHAIR_SEAT = CHAIR_SEAT_HEIGHT;
/** Uniform stock for legs, rails, and seat frame. */
export const CHAIR_STOCK = 0.044;
/** Total height is twice the seat, as in the oak original. */
export const CHAIR_TOTAL_H = CHAIR_SEAT_HEIGHT * 2;
const RAIL_H = CHAIR_STOCK * 1.75;
export const CHAIR_SIZE: [number, number, number] = [
  CHAIR_SEAT,
  CHAIR_SEAT_HEIGHT,
  CHAIR_SEAT,
];
/** Faces into the room from the right-back corner. */
export const CHAIR_YAW = (-60 * Math.PI) / 180;
const CORNER_INSET = 0.54;

export function chairPos(metrics: ShoeboxMetrics): [number, number, number] {
  return [metrics.width - CORNER_INSET, 0, -metrics.depth + CORNER_INSET];
}

export function chairForward() {
  return { x: Math.sin(CHAIR_YAW), z: Math.cos(CHAIR_YAW) };
}

export function chairSitPoint(metrics: ShoeboxMetrics): [number, number, number] {
  const [x, , z] = chairPos(metrics);
  const f = chairForward();
  const d = CHAIR_SEAT / 2 - 0.01;
  return [x + f.x * d, 0, z + f.z * d];
}

function useOakMap() {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#c4c4c4";
    ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 32; i += 1) {
      const x = (i / 32) * 128 + Math.sin(i * 1.7) * 4;
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.04 + (i % 6) * 0.018})`;
      ctx.lineWidth = 0.7 + (i % 4) * 0.35;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + 7, 128, x - 3, 256);
      ctx.stroke();
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }, []);

  useEffect(() => () => map?.dispose(), [map]);
  return map;
}

function Oak({ map, tone, fallback }: { map: CanvasTexture | null; tone: string; fallback: string }) {
  return (
    <meshStandardMaterial
      map={map ?? undefined}
      color={map ? tone : fallback}
      roughness={0.62}
      metalness={0.02}
    />
  );
}

function Beam({
  position,
  size,
  map,
  tone,
  fallback,
}: {
  position: [number, number, number];
  size: [number, number, number];
  map: CanvasTexture | null;
  tone: string;
  fallback: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <Oak map={map} tone={tone} fallback={fallback} />
    </mesh>
  );
}

export function ChairBox({
  metrics,
  onSit,
}: {
  metrics: ShoeboxMetrics;
  onSit?: () => void;
}) {
  const [x, , z] = chairPos(metrics);
  const oak = useOakMap();
  const palette = usePalette();
  const wood = palette.wood.tone;
  const seat = palette.wood.seat;
  const fallback = palette.wood.fallback;
  const t = CHAIR_STOCK;
  const w = CHAIR_SEAT;
  const inner = w - 2 * t;
  const half = w / 2;
  const edge = half - t / 2;
  const seatY = CHAIR_SEAT_HEIGHT - t / 2;

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, CHAIR_YAW, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSit?.();
      }}
    >
      {([-1, 1] as const).map((side) => (
        <Beam
          key={`f${side}`}
          position={[side * edge, CHAIR_SEAT_HEIGHT / 2, edge]}
          size={[t, CHAIR_SEAT_HEIGHT, t]}
          map={oak}
          tone={wood}
          fallback={fallback}
        />
      ))}
      {([-1, 1] as const).map((side) => (
        <Beam
          key={`r${side}`}
          position={[side * edge, CHAIR_TOTAL_H / 2, -edge]}
          size={[t, CHAIR_TOTAL_H, t]}
          map={oak}
          tone={wood}
          fallback={fallback}
        />
      ))}
      <Beam
        position={[0, seatY, 0]}
        size={[inner, t, inner]}
        map={oak}
        tone={seat}
        fallback={fallback}
      />
      <Beam
        position={[0, seatY, edge]}
        size={[inner, t, t]}
        map={oak}
        tone={wood}
        fallback={fallback}
      />
      <Beam
        position={[0, seatY, -edge]}
        size={[inner, t, t]}
        map={oak}
        tone={wood}
        fallback={fallback}
      />
      <Beam
        position={[edge, seatY, 0]}
        size={[t, t, inner]}
        map={oak}
        tone={wood}
        fallback={fallback}
      />
      <Beam
        position={[-edge, seatY, 0]}
        size={[t, t, inner]}
        map={oak}
        tone={wood}
        fallback={fallback}
      />
      <Beam
        position={[0, CHAIR_TOTAL_H - RAIL_H / 2, -edge]}
        size={[inner, RAIL_H, t]}
        map={oak}
        tone={wood}
        fallback={fallback}
      />
    </group>
  );
}
