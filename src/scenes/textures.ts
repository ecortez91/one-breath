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

  // Freediver, 3 frames of a dolphin kick. Drawn FACING RIGHT — arms lead at
  // the right edge, monofin trails at the left. In-scene: rotation +90° = head
  // down (descending), -90° = head up (ascending).
  if (!scene.textures.exists('fd-glide')) {
    const suit = 0x1d3a4a;
    const suitLite = 0x2f5d73;
    const finC = 0x3fa7d6;
    const finLite = 0x7cc6e8;
    const drawBase = () => {
      // torso with panel highlight
      g.fillStyle(suit, 1);
      g.fillRoundedRect(46, 20, 38, 16, 8);
      g.fillStyle(suitLite, 1);
      g.fillRoundedRect(52, 23, 24, 4, 2);
      // head + hood
      g.fillStyle(suit, 1);
      g.fillCircle(92, 28, 10);
      // mask glint
      g.fillStyle(0x9fe8ff, 0.95);
      g.fillRoundedRect(95, 23, 7, 6, 2);
      // streamlined arms leading, hands tip
      g.fillStyle(suit, 1);
      g.fillRect(100, 25, 18, 6);
      g.fillStyle(0xd9b38c, 1);
      g.fillCircle(119, 28, 3.2);
      // subtle rim light along the back for contrast in dark water
      g.lineStyle(2, 0x9fd0e8, 0.3);
      g.strokeRoundedRect(46, 20, 38, 16, 8);
    };
    const blade = (hingeX: number, hingeY: number, tipX: number, tipY: number) => {
      // swallow-blade monofin: two overlapping triangles from the hinge
      g.fillStyle(finC, 1);
      g.fillTriangle(hingeX, hingeY, tipX, tipY - 9, tipX + 7, tipY + 5);
      g.fillStyle(finLite, 0.85);
      g.fillTriangle(hingeX, hingeY, tipX + 4, tipY + 11, tipX + 10, tipY - 2);
    };
    // glide: body one straight line, fin level
    g.clear();
    drawBase();
    g.fillStyle(suit, 1);
    g.fillRoundedRect(22, 24, 28, 8, 4);
    blade(24, 28, 2, 28);
    g.generateTexture('fd-glide', 122, 56);
    // up-stroke: legs sweep up, blade snaps above the body line
    g.clear();
    drawBase();
    g.fillStyle(suit, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(50, 24), new Phaser.Math.Vector2(30, 12),
      new Phaser.Math.Vector2(24, 18), new Phaser.Math.Vector2(46, 33),
    ], true);
    blade(27, 15, 4, 6);
    g.generateTexture('fd-kick-up', 122, 56);
    // down-stroke: legs sweep down, blade snaps below
    g.clear();
    drawBase();
    g.fillStyle(suit, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(50, 32), new Phaser.Math.Vector2(30, 44),
      new Phaser.Math.Vector2(24, 38), new Phaser.Math.Vector2(46, 23),
    ], true);
    blade(27, 41, 4, 50);
    g.generateTexture('fd-kick-down', 122, 56);
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
