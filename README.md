# Kijkdoos

A looking-box: one block person in a room that stretches to the viewport corners. The AI only picks the next action. Poses and nav run locally.

```bash
npm install
npm run dev
```

Click floor to walk, chair to sit, character to glare.

| Key | Action |
| --- | --- |
| W | wave |
| G | glare |
| F | fidget |
| L | look at you |
| E | emote (shrug) |
| I | still |
| S | sit |
| X | stand |

Chair id is `chair-1` and stays that way.

## Day and night

The room mixes a warm day palette and a cool night palette from the viewer’s local clock.

- Day 8:00–18:00
- Night 20:30–5:30
- Dawn 5:30–8:00 and dusk 18:00–20:30 ease between them

Preview with `?hour=13` (day) or `?hour=1` (night).

## Behaviours

Standing and sitting both have a living idle (weight shift, look around) and **still** (frozen). He does not always move.

The dummy brain can pick: `idle`, `still`, `fidget`, `walk_to`, `sit`, `stand`, `wave`, `glare`, `look_at_user`, `emote`, `push_chair`, `move_chair`, `light_on`, `light_off`. Turns happen locally while walking. Fidget, look, and still work in the chair too.

## Furniture and lamp

Chair `chair-1` keeps a live pose (floor UV + yaw). Sit and walk still work after it moves. The dummy rarely asks to `push_chair` (slide, same facing) or `move_chair` (new legal pose). If a push or turn pins him against a wall, he keeps pushing the chair into the room until he can walk again. Poses that trapped him are stored and sent as `badChairPoses` / `trappedChair` so a later model can avoid them.

The hanging lamp can go off. He walks under the bulb and pulls the cord. The floor stays barely readable; it is never a black frame. Day/night still tints that dim fill.

Pose, lamp, and learned bad chair poses persist in `localStorage` (`kijkdoos.visit.v1`). Debug keys (not in the on-screen hint): O lamp, P push, M move.

## Moods and visits

Each time the page is shown, a visit starts. Mood is derived from the last **40** visits (oldest dropped):

- no log → shy
- last visit under 30 s → angry
- last visit 2 min or more, or three of the last five that long → happy
- otherwise → calm

The dummy weights glare, sit, wave, still, and the lamp from those counts and streaks. A later model can read the same snapshot fields (`mood`, `visitCount`, `lightOn`, `visitSummary`, `trappedChair`, `badChairPoses`).

## Leftover

- Pose polish (arms, sit, walk)
- `BRAIN=ollama` — Worker path exists; default is dummy. Model `llama3.1:8b-instruct`
- Chair mesh swap — same id `chair-1`
- Cloudflare deploy — `npm run deploy`

## Not now

No sleep, no skinned meshes, no Mixamo/UAL, no Blender, no voice, no faces, no physics, no multiplayer.
