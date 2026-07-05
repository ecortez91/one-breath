# One Breath 🤿

A freediving game. Dive as deep as you can on a single breath — manage your oxygen,
grab air bubbles, dodge jellyfish, and make it back to the surface. Depth only counts
if you bring it home.

**Play it:** https://one-breath-tawny.vercel.app

## How to play

- **Touch:** hold to swim toward your finger
- **Keyboard:** arrow keys / WASD
- Air bubbles restore O₂, jellyfish take it away
- Below 20 m you enter freefall and sink on your own — just like real freediving
- Surface before your O₂ runs out to bank your personal best. Black out and the ocean keeps it.

## Tech

- [Phaser 3](https://phaser.io/) + TypeScript + Vite
- Zero image/audio assets — every texture is generated programmatically
- Personal best stored in `localStorage`
- Mobile-first (portrait, touch controls), scales to desktop

## Run locally

```bash
npm install
npm run dev
```

## Why

I'm a freediver. This is what it feels like, minus the jellyfish being pink.

Built by [Eduardo Cortez](https://eduardocortez.dev).
