import Phaser from 'phaser';

export const W = 480;
export const PX_PER_M = 60;
export const SURFACE_Y = 400;
export const MAX_DEPTH_M = 150;
export const WORLD_H = SURFACE_Y + MAX_DEPTH_M * PX_PER_M + 200;

/** Sky, water gradient, surface waves, depth markers, sea floor. */
export function buildOcean(scene: Phaser.Scene): void {
  scene.add.rectangle(W / 2, SURFACE_Y / 2 - 100, W, SURFACE_Y + 200, 0xaed9f2).setDepth(0);
  scene.add.text(W / 2, SURFACE_Y - 240, '☀️', { fontSize: '64px' }).setOrigin(0.5).setDepth(1);
  scene.add.text(100, SURFACE_Y - 170, '☁️', { fontSize: '44px' }).setDepth(1);
  scene.add.text(360, SURFACE_Y - 200, '☁️', { fontSize: '36px' }).setDepth(1);

  const top = Phaser.Display.Color.ValueToColor(0x1583b8);
  const bottom = Phaser.Display.Color.ValueToColor(0x000308);
  const bandH = 300;
  const bands = Math.ceil((WORLD_H - SURFACE_Y) / bandH);
  for (let i = 0; i < bands; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, bands - 1, i);
    scene.add
      .rectangle(W / 2, SURFACE_Y + (i + 0.5) * bandH, W, bandH + 1,
        Phaser.Display.Color.GetColor(c.r, c.g, c.b))
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

  for (let m = 10; m <= MAX_DEPTH_M; m += 10) {
    const y = SURFACE_Y + m * PX_PER_M;
    scene.add.rectangle(W / 2, y, W - 40, 2, 0xffffff, 0.08).setDepth(2);
    scene.add.text(14, y - 20, `−${m} m`, {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#9fd0e8',
    }).setAlpha(0.5).setDepth(2);
  }

  const floorY = SURFACE_Y + MAX_DEPTH_M * PX_PER_M + 60;
  scene.add.rectangle(W / 2, floorY + 60, W, 160, 0x0a0f14).setDepth(2);
  scene.add.text(W / 2, floorY, '🪸  🐚  🪨  🐚  🪸', { fontSize: '34px' }).setOrigin(0.5).setDepth(2).setAlpha(0.7);
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
  const dark = Phaser.Math.Clamp((depth - 25) / 110, 0, 0.92);
  l.darkness.setAlpha(dark);
  l.glow.setPosition(diverX, diverY).setAlpha(dark > 0.1 ? Math.min(1, dark * 1.4) : 0);
}
