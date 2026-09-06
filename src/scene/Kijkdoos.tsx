import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { ACTOR_LOGIC, Controller, THOUGHT_CAP } from "../actor/Controller";
import { requestPlan } from "../brain/client";
import { CeilingLamp } from "./CeilingLamp";
import { ChairBox } from "./ChairBox";
import { Resident } from "./Resident";
import { Room } from "./Room";
import { ShoeboxCamera } from "./ShoeboxCamera";
import { computeShoebox, type ShoeboxMetrics } from "./shoebox";
import { useVisualViewportFill } from "./useVisualViewportFill";
import { PaletteBridge, usePalette } from "../useTheme";

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
  const palette = usePalette();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "w") c.request({ action: "wave" }, metrics);
      if (key === "g") c.request({ action: "glare" }, metrics);
      if (key === "f") c.request({ action: "fidget" }, metrics);
      if (key === "l") c.request({ action: "look_at_user" }, metrics);
      if (key === "e") c.request({ action: "emote" }, metrics);
      if (key === "i") c.request({ action: "still" }, metrics);
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
      <color attach="background" args={[palette.void]} />
      <ShoeboxCamera metrics={metrics} />
      <ambientLight color={palette.ambient} intensity={palette.ambientIntensity} />
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
  const palette = usePalette();
  useVisualViewportFill(stageRef);

  return (
    <div ref={stageRef} className="stage">
      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        shadows
        camera={{ fov: 55, near: 0.05, far: 40 }}
      >
        <PaletteBridge palette={palette}>
          <Scene />
        </PaletteBridge>
      </Canvas>
      <p className="hint">
        Click floor to walk · click chair to sit · click character to glare · W
        wave · G glare · F fidget · L look · E emote · I still · S sit · X stand
      </p>
    </div>
  );
}
