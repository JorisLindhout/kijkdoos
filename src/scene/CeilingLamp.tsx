import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  DirectionalLight,
  Group,
  Mesh,
  SpotLight,
  Vector2,
} from "three";
import { lerpHex } from "../theme";
import { usePalette } from "../useTheme";
import { useFurniture } from "./furniture";
import { type ShoeboxMetrics } from "./shoebox";

/** Hang the filament this far below the ceiling, meters. */
const DROP = 0.3;
const CORD_R = 0.004;
/**
 * Hidden silhouette fill when the lamp is off.
 * 0 = black frame. Raise toward 0.12 if you can barely see him.
 */
export const OFF_FILL = 0.035;

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
  const fill = useRef<DirectionalLight>(null);
  const cord = useRef<Mesh>(null);
  const bulb = useRef<Group>(null);
  const pull = useRef(0);
  const seenYank = useRef(0);
  const { scene } = useThree();
  const palette = usePalette();
  const { lightOn, yankId } = useFurniture();
  const halo = useHaloMap();
  const x = metrics.width / 2;
  const z = -metrics.depth / 2;
  const ceiling = metrics.height;
  const bulbY = ceiling - DROP;
  const cordLen = DROP - 0.14;
  /** Sit the lights above the glass so they still graze his head when he stands in front. */
  const lightY = ceiling - 0.05;
  /** Start the shadow map below the fixture so the bulb never occludes its own pool. */
  const shadowNear = lightY - bulbY + 0.04;
  const fillColor = lerpHex(palette.ambient, palette.hint, 0.72);

  useFrame((_, dt) => {
    if (yankId !== seenYank.current) {
      seenYank.current = yankId;
      pull.current = 1;
    }
    if (pull.current <= 0) return;
    pull.current = Math.max(0, pull.current - dt * 3.4);
    const drop = pull.current * pull.current * 0.05;
    if (bulb.current) bulb.current.position.y = bulbY - drop;
    if (cord.current) {
      const live = cordLen + drop;
      cord.current.position.y = -0.02 - live / 2;
      cord.current.scale.y = live / cordLen;
    }
  });

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

  useLayoutEffect(() => {
    const dir = fill.current;
    if (!dir) return;
    dir.target.position.set(x, 0.35, z);
    scene.add(dir.target);
    dir.target.updateMatrixWorld();
    return () => {
      scene.remove(dir.target);
    };
  }, [scene, x, z, lightOn]);

  return (
    <group>
      <directionalLight
        ref={fill}
        position={[x, metrics.height * 0.58, metrics.camDist * 0.7]}
        color={fillColor}
        intensity={lightOn ? 0 : OFF_FILL * 2}
      />
      <hemisphereLight
        color={fillColor}
        groundColor={palette.void}
        intensity={lightOn ? 0 : OFF_FILL * 0.7}
      />
      <spotLight
        ref={light}
        position={[x, lightY, z]}
        color={palette.lamp.light}
        intensity={lightOn ? palette.lamp.intensity : 0}
        distance={metrics.height * 3.2}
        decay={2}
        angle={0.9}
        penumbra={0.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.00022}
        shadow-normalBias={0.018}
        shadow-camera-near={shadowNear}
        shadow-camera-far={metrics.height * 2.2}
      />
      <pointLight
        position={[x, lightY, z]}
        color={palette.lamp.halo}
        intensity={lightOn ? palette.lamp.haloIntensity : 0}
        distance={0.55}
        decay={2}
      />
      <group position={[x, ceiling, z]}>
        <mesh position={[0, -0.006, 0]}>
          <cylinderGeometry args={[0.036, 0.04, 0.012, 24]} />
          <meshStandardMaterial color="#1a1c20" roughness={0.7} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.016, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.01, 12]} />
          <meshStandardMaterial color="#2a241c" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh ref={cord} position={[0, -0.02 - cordLen / 2, 0]}>
          <cylinderGeometry args={[CORD_R, CORD_R, cordLen, 8]} />
          <meshStandardMaterial color="#d8d2c8" roughness={0.7} metalness={0.05} />
        </mesh>
      </group>
      <group ref={bulb} position={[x, bulbY, z]}>
        <mesh position={[0, 0.128, 0]}>
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
            color={lightOn ? palette.lamp.bulb : "#2a2420"}
            emissive={palette.lamp.glow}
            emissiveIntensity={lightOn ? palette.lamp.emissive * 1.35 : 0}
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
              opacity={lightOn ? 0.55 : 0}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </sprite>
        )}
      </group>
    </group>
  );
}
