# Kijkdoos

A looking-box: one block person in a room that stretches to the viewport corners. The AI only picks the next action. Poses and nav run locally.

```bash
npm install
npm run dev
```

Click floor to walk, chair to sit, character to glare. W wave, G glare, S sit, X stand.

Chair id is `chair-1` and stays that way.

## Leftover

- Pose polish (arms, sit, walk)
- `BRAIN=ollama` — Worker path exists; default is dummy. Model `llama3.1:8b-instruct`
- Chair mesh swap — same id `chair-1`
- Cloudflare deploy — `npm run deploy`

## Not now

No sleep, no skinned meshes, no Mixamo/UAL, no Blender, no voice, no faces, no physics, no multiplayer.
