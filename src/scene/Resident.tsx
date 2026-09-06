import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type Group } from "three";
import { RIG, createBlockPerson } from "../actor/blockBody";
import { CLIP } from "../actor/clips";
import { type Controller, type PlayOpts } from "../actor/Controller";
import { PosePlayer } from "../actor/posePlayer";
import { type ShoeboxMetrics } from "./shoebox";

export function Resident({
  controller,
  metrics,
}: {
  controller: Controller;
  metrics: ShoeboxMetrics;
}) {
  const group = useRef<Group>(null);
  const person = useMemo(() => createBlockPerson(), [RIG]);
  const player = useMemo(() => new PosePlayer(person), [person]);

  useEffect(() => {
    const play = (name: string, loop: boolean, opts?: PlayOpts) => {
      player.play(name, loop, opts);
    };
    player.onFinished = () => controller.onClipFinished();
    controller.play = play;
    controller.start(metrics);
    play(CLIP.idle, false, { hold: "start" });
    return () => {
      player.onFinished = null;
      if (controller.play === play) controller.play = null;
    };
    // metrics is read once at mount; resize uses keepInRoom from tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, player]);

  useFrame((_state, dt) => {
    const step = Math.min(dt, 0.05);
    player.update(step);
    controller.tick(step, metrics, player.walkContact(), player.solesLocal());
    const g = group.current;
    if (g) {
      g.position.set(controller.x, controller.y, controller.z);
      g.rotation.set(0, controller.yaw, 0);
    }
  });

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        controller.clickCharacter();
      }}
    >
      <primitive object={person.root} />
    </group>
  );
}
