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

  // Freediver: 8 frames of a full dolphin-kick cycle. The undulation is a
  // travelling wave — amplitude grows from the (steady) head toward the fin,
  // like a real monofin stroke. Drawn FACING RIGHT, arms leading; in-scene
  // rotation +90° = head down (descending), -90° = head up (ascending).
  if (!scene.textures.exists('fd-0')) {
    const suit = 0x1d3a4a;
    const suitLite = 0x2f5d73;
    const finC = 0x3fa7d6;
    const finLite = 0x7cc6e8;
    for (let f = 0; f < 8; f++) {
      const phi = (f / 8) * Math.PI * 2;
      // wave offset: ~0 at the head (x=84), up to ±11px at the fin (x→0)
      const off = (x: number) => Math.sin(x * 0.085 - phi) * (1.5 + ((84 - x) / 84) * 9.5);
      g.clear();
      // body chain: overlapping circles along the spine (torso thick, legs slim)
      g.fillStyle(suit, 1);
      for (let x = 82; x >= 26; x -= 3) {
        g.fillCircle(x, 28 + off(x), x > 48 ? 8 : 5.5);
      }
      // suit panel highlight
      g.fillStyle(suitLite, 0.9);
      g.fillCircle(64, 28 + off(64), 4.5);
      g.fillCircle(58, 28 + off(58), 4.5);
      // head + mask glint (steady — good freedivers keep the head still)
      g.fillStyle(suit, 1);
      g.fillCircle(92, 28, 10);
      g.fillStyle(0x9fe8ff, 0.95);
      g.fillRoundedRect(95, 23, 7, 6, 2);
      // streamlined arms, fingertips
      g.fillStyle(suit, 1);
      g.fillRect(100, 25, 18, 6);
      g.fillStyle(0xd9b38c, 1);
      g.fillCircle(119, 28, 3.2);
      // swallow-blade monofin follows (and exaggerates) the wave at the ankles
      const hingeY = 28 + off(26);
      const tipY = 28 + off(4) * 1.5;
      g.fillStyle(finC, 1);
      g.fillTriangle(27, hingeY, 3, tipY - 10, 8, tipY + 7);
      g.fillStyle(finLite, 0.85);
      g.fillTriangle(27, hingeY, 3, tipY + 10, 9, tipY - 4);
      g.generateTexture('fd-' + f, 122, 56);
    }
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
