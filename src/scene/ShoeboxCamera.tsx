import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { type PerspectiveCamera } from "three";
import { type ShoeboxMetrics } from "./shoebox";

export function ShoeboxCamera({ metrics }: { metrics: ShoeboxMetrics }) {
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    const persp = camera as PerspectiveCamera;
    persp.fov = metrics.fovDeg;
    persp.aspect = size.width / Math.max(size.height, 1);
    persp.near = Math.max(0.02, metrics.camDist * 0.05);
    persp.far = metrics.camDist + metrics.depth + 4;
    persp.position.set(metrics.width / 2, metrics.height / 2, metrics.camDist);
    persp.up.set(0, 1, 0);
    persp.lookAt(metrics.width / 2, metrics.height / 2, 0);
    persp.updateProjectionMatrix();
  }, [camera, size.width, size.height, metrics]);

  return null;
}
