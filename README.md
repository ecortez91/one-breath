# One Breath 🤿

Two ways down, one rule: **depth only counts if you surface.**

**Play it:** https://one-breath-tawny.vercel.app

## 🌬 Freedive mode

Pure technique, rhythm-game style. Kick cues fall toward the hit zone — tap at the
exact moment for a PERFECT kick. The deeper you go, the faster and more irregular
the rhythm gets. Freefall takes over past 20 m. Tap TURN with enough O₂ left to
make it home, or the ocean keeps your depth.

## 🛢 Cave dive mode

Free exploration on scuba. Swim with your finger (or arrows), find gas tanks to
refill your air, dodge jellyfish, and get back to the surface.

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
