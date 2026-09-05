import { floorPoint, type ShoeboxMetrics } from "./shoebox";

export const CHAIR_ID = "chair-1";
export const CHAIR_U = 0.72;
export const CHAIR_V = 0.38;
export const CHAIR_SEAT_HEIGHT = 0.42;
export const CHAIR_SIZE: [number, number, number] = [0.45, CHAIR_SEAT_HEIGHT, 0.45];

export function ChairBox({
  metrics,
  onSit,
}: {
  metrics: ShoeboxMetrics;
  onSit?: () => void;
}) {
  const [x, , z] = floorPoint(metrics, CHAIR_U, CHAIR_V);
  const [sx, sy, sz] = CHAIR_SIZE;

  return (
    <group
      position={[x, 0, z]}
      onClick={(event) => {
        event.stopPropagation();
        onSit?.();
      }}
    >
      <mesh position={[0, sy - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[sx, 0.06, sz]} />
        <meshStandardMaterial color="#6e6e6e" />
      </mesh>
      {(
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const
      ).map(([lx, lz]) => (
        <mesh
          key={`${lx}${lz}`}
          position={[(sx / 2 - 0.05) * lx, (sy - 0.06) / 2, (sz / 2 - 0.05) * lz]}
          castShadow
        >
          <boxGeometry args={[0.045, sy - 0.06, 0.045]} />
          <meshStandardMaterial color="#5a5a5a" />
        </mesh>
      ))}
      <mesh position={[0, sy + 0.2, -sz / 2 + 0.04]} castShadow>
        <boxGeometry args={[sx, 0.4, 0.08]} />
        <meshStandardMaterial color="#5c5c5c" />
      </mesh>
    </group>
  );
}
