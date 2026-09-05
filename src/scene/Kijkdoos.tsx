import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { DirectionalLight } from "three";
import { ACTOR_LOGIC, Controller, THOUGHT_CAP } from "../actor/Controller";
import { requestPlan } from "../brain/client";
import { ChairBox } from "./ChairBox";
import { Resident } from "./Resident";
import { Room } from "./Room";
import { ShoeboxCamera } from "./ShoeboxCamera";
import { computeShoebox, type ShoeboxMetrics } from "./shoebox";
import { useVisualViewportFill } from "./useVisualViewportFill";

function KeyLight({ metrics }: { metrics: ShoeboxMetrics }) {
  const light = useRef<DirectionalLight>(null);
  const { scene } = useThree();
  const reach = metrics.camDist + metrics.depth + 2;

  useLayoutEffect(() => {
    const sun = light.current;
    if (!sun) return;
    sun.target.position.set(metrics.width / 2, 0.04, -metrics.depth);
    scene.add(sun.target);
    sun.target.updateMatrixWorld();
    return () => {
      scene.remove(sun.target);
    };
  }, [metrics, scene]);

  const span = Math.max(metrics.width, metrics.depth) * 1.15;

  return (
    <directionalLight
      ref={light}
      position={[metrics.width * 0.34, metrics.height * 1.15, metrics.camDist * 0.55]}
      intensity={0.95}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.00015}
      shadow-normalBias={0.012}
      shadow-camera-near={0.2}
      shadow-camera-far={reach}
      shadow-camera-left={-span}
      shadow-camera-right={span}
      shadow-camera-top={span}
      shadow-camera-bottom={-span * 0.45}
    />
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
      <ShoeboxCamera metrics={metrics} />
      <hemisphereLight args={["#fff6ea", "#9c8b73", 0.7]} />
      <ambientLight intensity={0.25} />
      <KeyLight metrics={metrics} />
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
