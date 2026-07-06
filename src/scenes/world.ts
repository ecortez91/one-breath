import Phaser from 'phaser';

export const W = 480;
export const PX_PER_M = 60;
export const SURFACE_Y = 400;

/** Real ocean zones. Crossing a boundary is announced in-game. */
export const ZONES = [
  { m: 200, label: 'THE TWILIGHT ZONE' },
  { m: 500, label: 'THE MIDNIGHT ZONE' },
];

/** Depth milestones — the progression ladder that keeps divers coming back. */
export const MILESTONES = [
  { m: 20, title: 'First Dip' },
  { m: 30, title: 'Blue Believer' },
  { m: 40, title: 'The Calling' },
  { m: 60, title: 'The Door to the Deep' },
  { m: 80, title: 'Deep Runner' },
  { m: 100, title: 'HECTOMETER' },
  { m: 130, title: 'Past the Record Books' },
  { m: 160, title: 'Superhuman' },
  { m: 200, title: 'Twilight Knocker' },
  { m: 300, title: 'The Abyss Calls' },
  { m: 500, title: 'Midnight Diver' },
  { m: 1000, title: 'One With the Ocean' },
];

export function titleFor(depth: number): string {
  let t = 'Surface Dweller';
  for (const ms of MILESTONES) {
    if (depth >= ms.m) t = ms.title;
  }
  return t;
}

/** Ambient creatures by depth (emoji for now). */
function creaturesAt(m: number): string[] {
  if (m < 200) return ['🐢', '🐬', '🐠', '🐟', '🐡'];
  if (m < 500) return ['🦑', '🐙', '🐡', '✨'];
  return ['👁️', '🦐', '🐙', '✨'];
}

export function worldHeight(maxM: number): number {
  return SURFACE_Y + maxM * PX_PER_M + 200;
}

/** Water colour at a given depth: tropical blue → twilight violet → black. */
function colorAt(m: number): Phaser.Display.Color {
  const stops: Array<[number, number]> = [
    [0, 0x1583b8], [200, 0x0a3550], [500, 0x0d1030], [1000, 0x000205],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (m <= stops[i][0]) {
      const [m0, c0] = stops[i - 1];
      const [m1, c1] = stops[i];
      const f = (m - m0) / (m1 - m0);
      const a = Phaser.Display.Color.ValueToColor(c0);
      const b = Phaser.Display.Color.ValueToColor(c1);
      const r = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(f * 100));
      return new Phaser.Display.Color(r.r, r.g, r.b);
    }
  }
  return Phaser.Display.Color.ValueToColor(0x000205);
}

/** Sky, water gradient, waves, depth markers, ambient creatures, sea floor. */
export function buildOcean(scene: Phaser.Scene, maxM: number): void {
  const worldH = worldHeight(maxM);

  scene.add.rectangle(W / 2, SURFACE_Y / 2 - 100, W, SURFACE_Y + 200, 0xaed9f2).setDepth(0);
  scene.add.text(W / 2, SURFACE_Y - 240, '☀️', { fontSize: '64px' }).setOrigin(0.5).setDepth(1);
  scene.add.text(100, SURFACE_Y - 170, '☁️', { fontSize: '44px' }).setDepth(1);
  scene.add.text(360, SURFACE_Y - 200, '☁️', { fontSize: '36px' }).setDepth(1);

  const bandH = 300;
  const bands = Math.ceil((worldH - SURFACE_Y) / bandH);
  for (let i = 0; i < bands; i++) {
    const midM = ((i + 0.5) * bandH) / PX_PER_M;
    const c = colorAt(midM);
    scene.add
      .rectangle(W / 2, SURFACE_Y + (i + 0.5) * bandH, W, bandH + 1, c.color)
      .setDepth(0);
  }

  for (let x = 0; x < W; x += 48) {
    const wave = scene.add.text(x, SURFACE_Y - 8, '🌊', { fontSize: '28px' }).setDepth(2).setAlpha(0.9);
    scene.tweens.add({
      targets: wave,
      y: SURFACE_Y - 2,
      duration: 1200 + (x % 5) * 120,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Depth markers: every 10 m in the shallows, every 50 m below 100 m
  for (let m = 10; m <= maxM; m += m < 100 ? 10 : 50) {
    const y = SURFACE_Y + m * PX_PER_M;
    const major = m % 50 === 0;
    scene.add.rectangle(W / 2, y, W - 40, major ? 3 : 2, 0xffffff, major ? 0.12 : 0.07).setDepth(2);
    scene.add.text(14, y - 20, `−${m} m`, {
      fontFamily: 'monospace',
      fontSize: major ? '17px' : '15px',
      color: '#9fd0e8',
    }).setAlpha(major ? 0.65 : 0.45).setDepth(2);
  }

  // Zone boundary lines
  for (const z of ZONES) {
    if (z.m >= maxM) continue;
    const y = SURFACE_Y + z.m * PX_PER_M;
    scene.add.text(W / 2, y + 26, `· ${z.label} ·`, {
      fontFamily: 'Georgia, serif', fontSize: '17px', fontStyle: 'italic', color: '#7ab8d8',
    }).setOrigin(0.5).setAlpha(0.55).setDepth(2);
  }

  buildAmbientCreatures(scene, maxM);

  const floorY = SURFACE_Y + maxM * PX_PER_M + 60;
  scene.add.rectangle(W / 2, floorY + 60, W, 160, 0x0a0f14).setDepth(2);
  scene.add.text(W / 2, floorY, '🪸  🐚  🪨  🐚  🪸', { fontSize: '34px' }).setOrigin(0.5).setDepth(2).setAlpha(0.7);
}

/** Passing sea life, denser near the surface, stranger with depth. */
function buildAmbientCreatures(scene: Phaser.Scene, maxM: number): void {
  let m = 6;
  while (m < maxM - 5) {
    const pool = creaturesAt(m);
    const emoji = pool[Math.floor(Math.random() * pool.length)];
    const x = Phaser.Math.Between(30, W - 30);
    const y = SURFACE_Y + m * PX_PER_M + Phaser.Math.Between(-40, 40);
    const t = scene.add.text(x, y, emoji, {
      fontSize: Phaser.Math.Between(20, 34) + 'px',
    }).setOrigin(0.5).setAlpha(0.75).setDepth(3);
    const drift = Phaser.Math.Between(60, 150) * (Math.random() > 0.5 ? 1 : -1);
    t.setFlipX(drift > 0);
    scene.tweens.add({
      targets: t,
      x: Phaser.Math.Clamp(x + drift, 25, W - 25),
      y: y + Phaser.Math.Between(-25, 25),
      duration: Phaser.Math.Between(3200, 6500),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    m += Phaser.Math.FloatBetween(12, 26);
  }
}

export type Lighting = {
  darkness: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Image;
  dangerVignette: Phaser.GameObjects.Rectangle;
};

export function buildLighting(scene: Phaser.Scene): Lighting {
  const glow = scene.add.image(0, 0, 'glow').setDepth(20).setScale(3).setAlpha(0);
  const darkness = scene.add.rectangle(W / 2, 400, W, 800, 0x000208)
    .setScrollFactor(0).setDepth(19).setAlpha(0);
  const dangerVignette = scene.add.rectangle(W / 2, 400, W, 800, 0x8a1020)
    .setScrollFactor(0).setDepth(21).setAlpha(0);
  return { darkness, glow, dangerVignette };
}

export function updateLighting(l: Lighting, depth: number, diverX: number, diverY: number): void {
  // Sunlight fades through the twilight zone; near-black past ~450 m
  const dark = Phaser.Math.Clamp((depth - 30) / 420, 0, 0.94);
  l.darkness.setAlpha(dark);
  l.glow.setPosition(diverX, diverY).setAlpha(dark > 0.08 ? Math.min(1, dark * 1.5) : 0);
}
