import { type ThreeEvent } from "@react-three/fiber";
import { type ShoeboxMetrics } from "./shoebox";

const FLOOR = "#4e3c2c";
const WALL = "#2c241c";
const CEILING = "#1a1511";
const BACK = "#261e18";

export function Room({
  metrics,
  onFloorClick,
}: {
  metrics: ShoeboxMetrics;
  onFloorClick?: (point: { x: number; z: number }) => void;
}) {
  const { width: w, height: h, depth: d } = metrics;
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
        <meshStandardMaterial color={FLOOR} roughness={0.92} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, h, zMid]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={CEILING} roughness={0.95} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[0, cy, zMid]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={WALL} roughness={0.94} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[w, cy, zMid]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={WALL} roughness={0.94} />
      </mesh>
      <mesh position={[cx, cy - 0.03, -d - 0.02]} receiveShadow>
        <boxGeometry args={[w + 0.04, h + 0.06, 0.04]} />
        <meshStandardMaterial color={BACK} roughness={0.94} />
      </mesh>
    </group>
  );
}
