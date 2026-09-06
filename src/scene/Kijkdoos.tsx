import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { SpotLight } from "three";
import { ACTOR_LOGIC, Controller, THOUGHT_CAP } from "../actor/Controller";
import { requestPlan } from "../brain/client";
import { ChairBox } from "./ChairBox";
import { Resident } from "./Resident";
import { Room } from "./Room";
import { ShoeboxCamera } from "./ShoeboxCamera";
import { computeShoebox, type ShoeboxMetrics } from "./shoebox";
import { useVisualViewportFill } from "./useVisualViewportFill";

function CeilingLamp({ metrics }: { metrics: ShoeboxMetrics }) {
  const light = useRef<SpotLight>(null);
  const { scene } = useThree();
  const x = metrics.width / 2;
  const z = -metrics.depth / 2;
  const y = metrics.height - 0.05;

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
        position={[x, y, z]}
        color="#efd4a0"
        intensity={70}
        distance={metrics.height * 3.2}
        decay={2}
        angle={0.92}
        penumbra={0.82}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.00022}
        shadow-normalBias={0.018}
        shadow-camera-near={0.06}
        shadow-camera-far={metrics.height * 2.2}
      />
      <pointLight
        position={[x, y, z]}
        color="#f2d9a8"
        intensity={6}
        distance={0.55}
        decay={2}
      />
      <mesh position={[x, y + 0.015, z]}>
        <sphereGeometry         args={[0.022, 16, 12]} />
        <meshStandardMaterial
          color="#e8c980"
          emissive="#e0b45a"
          emissiveIntensity={1.6}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

function Scene() {
  const { size, gl } = useThree();
  const metrics = useMemo(
    () => computeShoebox(size.width, size.height),
    [size.width, size.height],
  );
  const controllerRef = useRef<Controller | null>(null);
  if (
    !controllerRef.current ||
    typeof controllerRef.current.walkBusy !== "function" ||
    controllerRef.current.logic !== ACTOR_LOGIC
  ) {
    controllerRef.current = new Controller();
  }
  const c = controllerRef.current;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "w") c.request({ action: "wave" }, metrics);
      if (key === "g") c.request({ action: "glare" }, metrics);
      if (key === "s") c.request({ action: "sit" }, metrics);
      if (key === "x" && c.seated) c.request({ action: "stand" }, metrics);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [metrics]);

  useEffect(() => {
    const el = gl.domElement;
    let inside = false;
    const enter = () => {
      inside = true;
    };
    const leave = () => {
      inside = false;
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    const id = window.setInterval(() => {
      if (inside) c.stareSeconds += 0.25;
      else c.stareSeconds = 0;
    }, 250);
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      window.clearInterval(id);
    };
  }, [c, gl]);

  useEffect(() => {
    let cancelled = false;
    const id = window.setInterval(() => {
      void think(c, metrics, () => cancelled);
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [c, metrics]);

  return (
    <>
      <color attach="background" args={["#050403"]} />
      <ShoeboxCamera metrics={metrics} />
      <ambientLight color="#1c140e" intensity={0.045} />
      <CeilingLamp metrics={metrics} />
      <Room
        metrics={metrics}
        onFloorClick={(point) => c.clickFloor(point, metrics)}
      />
      <ChairBox metrics={metrics} onSit={() => c.clickChair(metrics)} />
      <Suspense fallback={null}>
        <Resident controller={c} metrics={metrics} />
      </Suspense>
    </>
  );
}

async function think(
  controller: Controller,
  metrics: ShoeboxMetrics,
  isCancelled: () => boolean,
) {
  if (controller.walkBusy() || controller.thoughts >= THOUGHT_CAP) return;
  const plan = await requestPlan(controller.snapshot(metrics));
  if (isCancelled() || !plan) return;
  controller.poked = false;
  controller.thoughts += 1;
  controller.applyPlan(plan, metrics);
}

export function Kijkdoos() {
  const stageRef = useRef<HTMLDivElement>(null);
  useVisualViewportFill(stageRef);

  return (
    <div ref={stageRef} className="stage">
      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        shadows
        camera={{ fov: 55, near: 0.05, far: 40 }}
      >
        <Scene />
      </Canvas>
      <p className="hint">
        Click floor to walk · click chair to sit · click character to glare · W
        wave · G glare · S sit · X stand
      </p>
    </div>
  );
}
