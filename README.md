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

The dummy brain can pick: `idle`, `still`, `fidget`, `walk_to`, `sit`, `stand`, `wave`, `glare`, `look_at_user`, `emote`. Turns happen locally while walking. Fidget, look, and still work in the chair too.

## Leftover

- Pose polish (arms, sit, walk)
- `BRAIN=ollama` — Worker path exists; default is dummy. Model `llama3.1:8b-instruct`
- Chair mesh swap — same id `chair-1`
- Cloudflare deploy — `npm run deploy`

## Not now

No sleep, no skinned meshes, no Mixamo/UAL, no Blender, no voice, no faces, no physics, no multiplayer.
