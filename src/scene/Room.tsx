import { type ThreeEvent } from "@react-three/fiber";
import { usePalette } from "../useTheme";
import { type ShoeboxMetrics } from "./shoebox";

export function Room({
  metrics,
  onFloorClick,
}: {
  metrics: ShoeboxMetrics;
  onFloorClick?: (point: { x: number; z: number }) => void;
}) {
  const { width: w, height: h, depth: d } = metrics;
  const palette = usePalette();
  const cx = w / 2;
  const cy = h / 2;
  const zMid = -d / 2;

  const handleFloor = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onFloorClick?.({ x: event.point.x, z: event.point.z });
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cx, 0, zMid]}
        receiveShadow
        onClick={handleFloor}
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={palette.room.floor} roughness={0.92} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, h, zMid]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={palette.room.ceiling} roughness={0.95} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[0, cy, zMid]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={palette.room.wall} roughness={0.94} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[w, cy, zMid]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={palette.room.wall} roughness={0.94} />
      </mesh>
      <mesh position={[cx, cy - 0.03, -d - 0.02]} receiveShadow>
        <boxGeometry args={[w + 0.04, h + 0.06, 0.04]} />
        <meshStandardMaterial color={palette.room.back} roughness={0.94} />
      </mesh>
    </group>
  );
}
