import Phaser from 'phaser';

/** Generate all game textures programmatically — no image assets needed. */
export function makeTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Bubble: soft white circle with highlight
  if (!scene.textures.exists('bubble')) {
    g.clear();
    g.fillStyle(0xbfe8ff, 0.35);
    g.fillCircle(16, 16, 14);
    g.lineStyle(2, 0xdff4ff, 0.8);
    g.strokeCircle(16, 16, 14);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(10, 10, 4);
    g.generateTexture('bubble', 32, 32);
  }

  // Jellyfish: pink dome + tentacles (drawn, since the jellyfish emoji
  // is missing on many devices)
  if (!scene.textures.exists('jelly')) {
    g.clear();
    g.fillStyle(0xff9ecf, 0.9);
    g.slice(24, 22, 20, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
    g.fillPath();
    g.fillStyle(0xffc2e2, 0.9);
    g.fillEllipse(24, 22, 40, 12);
    g.lineStyle(3, 0xff9ecf, 0.8);
    for (let i = 0; i < 5; i++) {
      const x = 8 + i * 8;
      g.beginPath();
      g.moveTo(x, 26);
      g.lineTo(x + (i % 2 === 0 ? 3 : -3), 38);
      g.lineTo(x, 48);
      g.strokePath();
    }
    g.generateTexture('jelly', 48, 52);
  }

  // Cave rock: jagged blob, gets tiled/scaled to build walls
  if (!scene.textures.exists('rock')) {
    const pts = [
      [4, 30], [16, 8], [42, 2], [72, 10], [92, 26],
      [88, 48], [64, 60], [28, 58], [6, 46],
    ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
    g.clear();
    g.fillStyle(0x1c2a35, 1);
    g.fillPoints(pts, true);
    g.fillStyle(0x2b3f4e, 0.7);
    g.fillCircle(30, 22, 10);
    g.fillCircle(62, 34, 13);
    g.lineStyle(3, 0x0d161d, 0.9);
    g.strokePoints(pts, true, true);
    g.generateTexture('rock', 96, 62);
  }

  // Rhythm cue ring (freedive mode)
  if (!scene.textures.exists('cue')) {
    g.clear();
    g.lineStyle(5, 0x4be3a0, 1);
    g.strokeCircle(28, 28, 22);
    g.fillStyle(0x4be3a0, 0.25);
    g.fillCircle(28, 28, 22);
    g.generateTexture('cue', 56, 56);
  }

  // Soft radial glow (diver's "light" in the dark depths)
  if (!scene.textures.exists('glow')) {
    const size = 256;
    const canvas = scene.textures.createCanvas('glow', size, size);
    if (canvas) {
      const ctx = canvas.getContext();
      const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
      grad.addColorStop(0, 'rgba(140, 200, 255, 0.35)');
      grad.addColorStop(0.5, 'rgba(80, 140, 210, 0.12)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }
  }

  g.destroy();
}
