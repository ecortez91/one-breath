# One Breath 🤿

Two ways down, one rule: **depth only counts if you surface.**

**Play it:** https://one-breath-tawny.vercel.app

## 🌬 Freedive mode

A real dive in three acts, rhythm-game style:

1. **Kick down** — cues fall in pairs (kick-kick-glide, like real finning). Tap on time.
2. **Freefall (−32 m)** — you stop kicking; the ocean takes you down for free. Hold
   your streamline through occasional posture checks and watch the depth pile up.
3. **The swim home** — tap TURN (watch the flip) and grind back up. This is where
   the O₂ goes.

Below 40% O₂ the contractions start — red cues you must **resist, not tap**, like a
real urge to breathe. The white marker on your O₂ bar estimates what the swim home
costs from your current depth: the whole game is that calculation. Depth milestones
("The Door to the Deep", "HECTOMETER"…) mark your progression, and real ocean zones
wait below: the Twilight Zone at 200 m, the Midnight Zone at 500 m.

## 🪨 Cave dive mode

Navigate a winding cave system that narrows as you descend. Swim with your finger
(or arrows), grab O₂ bubbles, dodge jellyfish, and find your way back to the surface.
The cave layout is procedurally generated — every dive is a different cave.

Beat a record in either mode and enter your name, arcade style.

## Tech

- [Phaser 3](https://phaser.io/) + TypeScript + Vite
- Zero image/audio assets — every texture is generated programmatically
- Records (depth + nickname per mode) in `localStorage`
- Mobile-first (portrait, touch), scales to desktop
- Gameplay values live in the update loop, never in tweens — backgrounded tabs can't corrupt a run

## Run locally

```bash
npm install
npm run dev
```

## Why

I'm a freediver. Freediving isn't about finding air down there — it's rhythm,
efficiency, and knowing when to turn around. Now that's the game.

Built by [Eduardo Cortez](https://eduardocortez.dev).
