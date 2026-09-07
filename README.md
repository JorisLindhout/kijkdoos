# Kijkdoos

![Block puppet standing under a hanging bulb next to a chair in a dark shoebox room](kijkdoos.png)

A viewport-filling 3D shoebox: one block puppet, a chair, and a lamp. The AI only picks the next action. Poses and navigation run locally.

```bash
npm install
npm run dev
```

## Dev controls

Production has no click or keyboard cheats. In `npm run dev`, clicks and keys are enabled and logged to the console.

| Input | Action |
| --- | --- |
| Click floor | walk there |
| Click chair | sit |
| Click puppet | glare |
| Hover canvas | count as staring |
| W | wave |
| G | glare |
| F | fidget |
| L | look at the camera |
| E | emote (shrug) |
| I | still |
| S | sit |
| X | stand |
| O | toggle lamp |
| P | push chair |
| M | move chair |
| K | kick chair |

## Day and night

The room mixes a warm day palette and a cool night palette from the viewer’s local clock.

- Day 8:00–18:00
- Night 20:30–5:30
- Dawn 5:30–8:00 and dusk 18:00–20:30 ease between them

Preview with `?hour=13` (day) or `?hour=1` (night). Dev only.

## Behaviours

Standing and sitting both have a living idle (weight shift, look around) and **still** (frozen). Motion is not constant.

The dummy brain can pick self actions (`idle`, `still`, `fidget`, `walk_to`, `stand`, `wave`, `glare`, `look_at_user`, `emote`) or a verb an object currently advertises. Chair `chair-1` offers `sit`, `push`, `move`, and `kick` when those are physically possible. Lamp `lamp-1` offers `light_on` or `light_off`. Turns happen locally while walking. Fidget, look, and still work in the chair too.

## Furniture and lamp

Chair `chair-1` keeps a live pose (floor UV + yaw). Sit and stand use the open face (the seat). `push` and `move` walk behind the backrest, grab the top rail, then slide or turn.

If the back is blocked (corner or wall) and the puppet is next to the chair, the chair advertises `kick` instead of `push`/`move`. The kick stands on the wall-facing side so the chair slides into the room, then a back grab is retried. Kick from across the room is off unless peak anger advertises `kick`. If already on the wall-facing side, the kick happens from there. If the path is blocked, a sidestep runs first rather than walking into the chair. While `trappedChair`, or `backBlocked` while `chairInReach`, `kick` stays advertised until a walk is possible. Poses that caused a trap are stored and sent as `badChairPoses` / `trappedChair` / `backBlocked`.

The hanging lamp can go off. The puppet walks under the bulb and pulls the cord. The floor stays barely readable; it is never a black frame. Day/night still tints that dim fill.

Pose, lamp, and learned bad chair poses persist in `localStorage` (`kijkdoos.visit.v1`).

## Moods and visits

Each time the page is shown, a visit starts. Mood is derived from the last **40** visits (oldest dropped):

- no log → shy
- last visit under 30 s → angry
- last visit 2 min or more, or three of the last five that long → happy
- otherwise → calm

The dummy weights glare, sit, wave, still, the lamp, and kicks from those counts and streaks. Two short visits in a row, or three failed moves this visit, is peak anger (`kick` may be advertised from far away). Fails this visit (`failCount`) can turn the live mood angry. A later model can read the same snapshot fields (`mood`, `visitCount`, `lightOn`, `visitSummary`, `trappedChair`, `backBlocked`, `chairInReach`, `failCount`, `failedActions`, `badChairPoses`).
