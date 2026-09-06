import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PCFShadowMap } from "three";
import { ACTOR_LOGIC, Controller, THOUGHT_CAP } from "../actor/Controller";
import { requestPlan } from "../brain/client";
import { DEV, logDevCheatsheet } from "../dev";
import { PaletteBridge, usePalette } from "../useTheme";
import { endVisit, hydrateVisit, noteVisitStare } from "../visit";
import { CeilingLamp, OFF_FILL } from "./CeilingLamp";
import { ChairBox } from "./ChairBox";
import { getChairUV, getLightOn, setChairUV, useFurniture } from "./furniture";
import { Resident } from "./Resident";
import { Room } from "./Room";
import { ShoeboxCamera } from "./ShoeboxCamera";
import { computeShoebox, type ShoeboxMetrics } from "./shoebox";
import { useVisualViewportFill, viewportCssSize } from "./useVisualViewportFill";

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
  const { lightOn } = useFurniture();

  const prevMetrics = useRef(metrics);

  useLayoutEffect(() => {
    const prev = prevMetrics.current;
    setChairUV(getChairUV(), metrics);
    c.relayout(prev, metrics);
    prevMetrics.current = metrics;
  }, [c, metrics]);

  useEffect(() => {
    if (!DEV) return;
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
      if (key === "o") {
        c.request({ action: getLightOn() ? "light_off" : "light_on" }, metrics);
      }
      if (key === "p") c.request({ action: "push_chair" }, metrics);
      if (key === "m") c.request({ action: "move_chair" }, metrics);
      if (key === "k") c.request({ action: "kick_chair" }, metrics);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [c, metrics]);

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
      if (inside) {
        c.stareSeconds += 0.25;
        noteVisitStare(c.stareSeconds);
      } else c.stareSeconds = 0;
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
      <ambientLight
        color={lightOn ? palette.ambient : palette.hint}
        intensity={lightOn ? palette.ambientIntensity : OFF_FILL}
      />
      <CeilingLamp metrics={metrics} />
      <Room
        metrics={metrics}
        onFloorClick={DEV ? (point) => c.clickFloor(point, metrics) : undefined}
      />
      <ChairBox metrics={metrics} onSit={DEV ? () => c.clickChair(metrics) : undefined} />
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

function bootVisit() {
  try {
    const view = viewportCssSize();
    hydrateVisit(computeShoebox(view.width, view.height));
  } catch {
    /* keep furniture defaults */
  }
}

export function Kijkdoos() {
  const stageRef = useRef<HTMLDivElement>(null);
  const palette = usePalette();
  const [canvasReady, setCanvasReady] = useState(false);
  const [overlayOut, setOverlayOut] = useState(false);
  const [overlayGone, setOverlayGone] = useState(false);
  useVisualViewportFill(stageRef);
  useState(() => {
    bootVisit();
    return true;
  });

  useEffect(() => {
    logDevCheatsheet();
  }, []);

  useEffect(() => {
    const hide = () => endVisit();
    const onVis = () => {
      if (document.visibilityState === "hidden") hide();
      else bootVisit();
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!canvasReady) return;
    const fade = window.setTimeout(() => setOverlayOut(true), 16);
    const gone = window.setTimeout(() => setOverlayGone(true), 220);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(gone);
    };
  }, [canvasReady]);

  return (
    <div ref={stageRef} className="stage">
      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        shadows={{ type: PCFShadowMap }}
        camera={{ fov: 55, near: 0.05, far: 40 }}
        onCreated={() => setCanvasReady(true)}
      >
        <PaletteBridge palette={palette}>
          <Scene />
        </PaletteBridge>
      </Canvas>
      {!overlayGone && (
        <p className={`looking${overlayOut ? " is-out" : ""}`}>Looking…</p>
      )}
    </div>
  );
}
