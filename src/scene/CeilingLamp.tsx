import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  SpotLight,
  Vector2,
} from "three";
import { usePalette } from "../useTheme";
import { type ShoeboxMetrics } from "./shoebox";

/** Hang the filament this far below the ceiling, meters. */
const DROP = 0.3;
const CORD_R = 0.004;

const BULB_PROFILE = [
  [0.007, 0.112],
  [0.012, 0.1],
  [0.014, 0.086],
  [0.032, 0.068],
  [0.044, 0.046],
  [0.048, 0.026],
  [0.04, 0.008],
  [0, 0],
].map(([x, y]) => new Vector2(x, y));

function useHaloMap() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.08, "rgba(255,255,255,0.45)");
    g.addColorStop(0.22, "rgba(255,255,255,0.12)");
    g.addColorStop(0.55, "rgba(255,255,255,0.03)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new CanvasTexture(canvas);
  }, []);
}

export function CeilingLamp({ metrics }: { metrics: ShoeboxMetrics }) {
  const light = useRef<SpotLight>(null);
  const { scene } = useThree();
  const palette = usePalette();
  const halo = useHaloMap();
  const x = metrics.width / 2;
  const z = -metrics.depth / 2;
  const ceiling = metrics.height;
  const bulbY = ceiling - DROP;
  const cordLen = DROP - 0.14;
  /** Sit the lights above the glass so they still graze his head when he stands in front. */
  const lightY = ceiling - 0.05;

  useLayoutEffect(() => {
    const spot = light.current;
    if (!spot) return;
    spot.target.position.set(x, 0, z);
    scene.add(spot.target);
    spot.target.updateMatrixWorld();
    return () => {
      scene.remove(spot.target);
    };
  }, [scene, x, z]);

  return (
    <group>
      <spotLight
        ref={light}
        position={[x, lightY, z]}
        color={palette.lamp.light}
        intensity={palette.lamp.intensity}
        distance={metrics.height * 3.2}
        decay={2}
        angle={0.9}
        penumbra={0.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.00022}
        shadow-normalBias={0.018}
        shadow-camera-near={0.06}
        shadow-camera-far={metrics.height * 2.2}
      />
      <pointLight
        position={[x, lightY, z]}
        color={palette.lamp.halo}
        intensity={palette.lamp.haloIntensity}
        distance={0.55}
        decay={2}
      />
      <group position={[x, ceiling, z]}>
        <mesh position={[0, -0.006, 0]} castShadow>
          <cylinderGeometry args={[0.036, 0.04, 0.012, 24]} />
          <meshStandardMaterial color="#1a1c20" roughness={0.7} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.016, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.01, 12]} />
          <meshStandardMaterial color="#2a241c" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[0, -0.02 - cordLen / 2, 0]}>
          <cylinderGeometry args={[CORD_R, CORD_R, cordLen, 8]} />
          <meshStandardMaterial color="#d8d2c8" roughness={0.7} metalness={0.05} />
        </mesh>
      </group>
      <group position={[x, bulbY, z]}>
        <mesh position={[0, 0.128, 0]} castShadow>
          <cylinderGeometry args={[0.017, 0.019, 0.038, 20]} />
          <meshStandardMaterial color="#5c3d28" roughness={0.38} metalness={0.62} />
        </mesh>
        <mesh position={[0, 0.112, 0]}>
          <cylinderGeometry args={[0.013, 0.0145, 0.012, 16]} />
          <meshStandardMaterial color="#3a281c" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh>
          <latheGeometry args={[BULB_PROFILE, 32]} />
          <meshStandardMaterial
            color={palette.lamp.bulb}
            emissive={palette.lamp.glow}
            emissiveIntensity={palette.lamp.emissive * 1.35}
            roughness={0.18}
            metalness={0.02}
            toneMapped={false}
          />
        </mesh>
        {halo && (
          <sprite scale={[0.42, 0.42, 1]} position={[0, 0.03, 0]}>
            <spriteMaterial
              map={halo}
              color={palette.lamp.halo}
              transparent
              opacity={0.55}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </sprite>
        )}
      </group>
    </group>
  );
}
