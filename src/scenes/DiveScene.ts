import Phaser from 'phaser';
import { makeTextures } from './textures';
import { getBest, saveBest } from './records';

const W = 480;
const PX_PER_M = 60; // world pixels per meter of depth
const SURFACE_Y = 400; // y where the water begins
const MAX_DEPTH_M = 150;
const WORLD_H = SURFACE_Y + MAX_DEPTH_M * PX_PER_M + 200;

const O2_MAX = 100;
const O2_BASE_DRAIN = 2.2; // per second, just existing
const O2_SWIM_DRAIN = 1.6; // extra per second while actively swimming
const O2_BUBBLE = 14;
const O2_JELLY_HIT = 18;

type Pickup = { obj: Phaser.GameObjects.Image; alive: boolean };

export class DiveScene extends Phaser.Scene {
  private diver!: Phaser.GameObjects.Text;
  private body!: Phaser.Physics.Arcade.Body;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private o2 = O2_MAX;
  private maxDepth = 0;
  private state: 'diving' | 'blackout' | 'breathing' = 'breathing';
  private stunUntil = 0;
  private invulnUntil = 0;

  private bubbles: Pickup[] = [];
  private jellies: Pickup[] = [];

  private darkness!: Phaser.GameObjects.Rectangle;
  private dangerVignette!: Phaser.GameObjects.Rectangle;
  private glow!: Phaser.GameObjects.Image;

  private o2Fill!: Phaser.GameObjects.Rectangle;
  private depthText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('dive');
  }

  create(): void {
    makeTextures(this);
    this.o2 = O2_MAX;
    this.maxDepth = 0;
    this.state = 'diving';
    this.bubbles = [];
    this.jellies = [];

    this.buildWorld();
    this.buildDiver();
    this.buildPickups();
    this.buildLighting();
    this.buildHud();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.cameras.main.setBounds(0, 0, W, WORLD_H);
    this.cameras.main.startFollow(this.diver, false, 0.12, 0.12);
    this.cameras.main.fadeIn(400);
  }

  private buildWorld(): void {
    // Sky
    this.add.rectangle(W / 2, SURFACE_Y / 2 - 100, W, SURFACE_Y + 200, 0xaed9f2).setDepth(0);
    this.add.text(W / 2, SURFACE_Y - 240, '☀️', { fontSize: '64px' }).setOrigin(0.5).setDepth(1);
    this.add.text(100, SURFACE_Y - 170, '☁️', { fontSize: '44px' }).setDepth(1);
    this.add.text(360, SURFACE_Y - 200, '☁️', { fontSize: '36px' }).setDepth(1);

    // Water: gradient bands from tropical blue to abyss black
    const top = Phaser.Display.Color.ValueToColor(0x1583b8);
    const bottom = Phaser.Display.Color.ValueToColor(0x000308);
    const bandH = 300;
    const bands = Math.ceil((WORLD_H - SURFACE_Y) / bandH);
    for (let i = 0; i < bands; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, bands - 1, i);
      this.add
        .rectangle(W / 2, SURFACE_Y + (i + 0.5) * bandH, W, bandH + 1,
          Phaser.Display.Color.GetColor(c.r, c.g, c.b))
        .setDepth(0);
    }

    // Surface waves
    for (let x = 0; x < W; x += 48) {
      const wave = this.add.text(x, SURFACE_Y - 8, '🌊', { fontSize: '28px' }).setDepth(2).setAlpha(0.9);
      this.tweens.add({
        targets: wave,
        y: SURFACE_Y - 2,
        duration: 1200 + (x % 5) * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Depth markers every 10 m
    for (let m = 10; m <= MAX_DEPTH_M; m += 10) {
      const y = SURFACE_Y + m * PX_PER_M;
      this.add.rectangle(W / 2, y, W - 40, 2, 0xffffff, 0.08).setDepth(2);
      this.add.text(14, y - 20, `−${m} m`, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#9fd0e8',
      }).setAlpha(0.5).setDepth(2);
    }

    // Sea floor
    const floorY = SURFACE_Y + MAX_DEPTH_M * PX_PER_M + 60;
    this.add.rectangle(W / 2, floorY + 60, W, 160, 0x0a0f14).setDepth(2);
    this.add.text(W / 2, floorY, '🪸  🐚  🪨  🐚  🪸', { fontSize: '34px' }).setOrigin(0.5).setDepth(2).setAlpha(0.7);
  }

  private buildDiver(): void {
    this.diver = this.add.text(W / 2, SURFACE_Y + 30, '🤿', { fontSize: '44px' }).setOrigin(0.5).setDepth(10);
    this.physics.add.existing(this.diver);
    this.body = this.diver.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(36, 36, true);
    this.body.setMaxVelocity(200, 230);
    this.body.setDrag(160, 140);
    this.body.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, SURFACE_Y - 60, W, WORLD_H - SURFACE_Y + 60);

    // Exhale bubbles trail
    this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => {
        if (this.state === 'blackout' || this.depthM() < 0.5) return;
        const b = this.add.image(this.diver.x + 14, this.diver.y - 14, 'bubble')
          .setScale(0.35).setAlpha(0.7).setDepth(9);
        this.tweens.add({
          targets: b,
          y: b.y - 90,
          x: b.x + Phaser.Math.Between(-12, 12),
          alpha: 0,
          scale: 0.15,
          duration: 1400,
          onComplete: () => b.destroy(),
        });
      },
    });
  }

  private buildPickups(): void {
    // Air bubbles: denser near the surface, sparse in the deep
    let m = 4;
    while (m < MAX_DEPTH_M - 4) {
      const x = Phaser.Math.Between(50, W - 50);
      const y = SURFACE_Y + m * PX_PER_M + Phaser.Math.Between(-20, 20);
      const img = this.add.image(x, y, 'bubble').setScale(1.15).setDepth(5);
      this.tweens.add({
        targets: img,
        y: y - 14,
        duration: Phaser.Math.Between(1400, 2200),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.bubbles.push({ obj: img, alive: true });
      m += Phaser.Math.FloatBetween(2, 2.5) + (m / 30); // spacing grows with depth
    }

    // Jellyfish: start at 12 m, get more frequent with depth
    m = 12;
    while (m < MAX_DEPTH_M - 2) {
      const x = Phaser.Math.Between(50, W - 50);
      const y = SURFACE_Y + m * PX_PER_M;
      const img = this.add.image(x, y, 'jelly').setDepth(6);
      this.tweens.add({
        targets: img,
        x: Phaser.Math.Clamp(x + Phaser.Math.Between(-90, 90), 40, W - 40),
        y: y - Phaser.Math.Between(20, 50),
        duration: Phaser.Math.Between(2200, 3600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.jellies.push({ obj: img, alive: true });
      m += Phaser.Math.FloatBetween(7, 12) - Math.min(4, m / 30); // closer together when deep
    }
  }

  private buildLighting(): void {
    this.glow = this.add.image(0, 0, 'glow').setDepth(20).setScale(3).setAlpha(0);
    this.darkness = this.add.rectangle(W / 2, 400, W, 800, 0x000208)
      .setScrollFactor(0).setDepth(19).setAlpha(0);
    this.dangerVignette = this.add.rectangle(W / 2, 400, W, 800, 0x8a1020)
      .setScrollFactor(0).setDepth(21).setAlpha(0);
  }

  private buildHud(): void {
    const hud = 100;
    // O2 bar
    this.add.rectangle(24, 24, 200, 22, 0x02121f, 0.75).setOrigin(0, 0.5).setScrollFactor(0).setDepth(hud);
    this.o2Fill = this.add.rectangle(26, 24, 196, 16, 0x4be3a0).setOrigin(0, 0.5).setScrollFactor(0).setDepth(hud + 1);
    this.add.text(24, 42, 'O₂', {
      fontFamily: 'monospace', fontSize: '13px', color: '#bcd9ea',
    }).setScrollFactor(0).setDepth(hud);

    this.depthText = this.add.text(W - 24, 16, '0 m', {
      fontFamily: 'monospace', fontSize: '26px', color: '#e8f4ff',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    this.bestText = this.add.text(W - 24, 48, getBest() > 0 ? `best ${getBest()} m` : '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffd166',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    this.banner = this.add.text(W / 2, 220, '', {
      fontFamily: 'Georgia, serif', fontSize: '30px', color: '#e8f4ff',
      align: 'center', stroke: '#02121f', strokeThickness: 5, lineSpacing: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hud + 2);
  }

  private depthM(): number {
    return Math.max(0, (this.diver.y - SURFACE_Y) / PX_PER_M);
  }

  update(time: number, deltaMs: number): void {
    if (this.state === 'blackout') return;
    const dt = deltaMs / 1000;
    const depth = this.depthM();
    this.maxDepth = Math.max(this.maxDepth, depth);

    // ── Controls ──
    let ax = 0;
    let ay = 0;
    const stunned = time < this.stunUntil;
    if (!stunned) {
      const p = this.input.activePointer;
      if (p.isDown) {
        const dx = p.worldX - this.diver.x;
        const dy = p.worldY - this.diver.y;
        const len = Math.hypot(dx, dy);
        if (len > 12) {
          ax = (dx / len) * 340;
          ay = (dy / len) * 340;
        }
      } else {
        if (this.cursors.left.isDown || this.keys.A.isDown) ax = -340;
        else if (this.cursors.right.isDown || this.keys.D.isDown) ax = 340;
        if (this.cursors.up.isDown || this.keys.W.isDown) ay = -340;
        else if (this.cursors.down.isDown || this.keys.S.isDown) ay = 340;
      }
    }
    const swimming = ax !== 0 || ay !== 0;

    // Buoyancy: pushed up near the surface, pulled into freefall when deep
    if (depth < 8) ay -= 60;
    else if (depth > 20) ay += 45;

    this.body.setAcceleration(ax, ay);
    if (this.body.velocity.x !== 0) this.diver.setFlipX(this.body.velocity.x < 0);

    // ── O₂ ──
    if (this.state === 'breathing') {
      // Breathe up at the surface; diving early cuts the breathe-up short
      this.o2 = Math.min(O2_MAX, this.o2 + 45 * dt);
      if (this.o2 >= O2_MAX || depth > 1.5) {
        this.state = 'diving';
        this.maxDepth = depth;
        this.tweens.add({ targets: this.banner, alpha: 0, duration: 400 });
      }
    } else if (depth > 0.5) {
      this.o2 -= (O2_BASE_DRAIN + (swimming ? O2_SWIM_DRAIN : 0) + depth / 50) * dt;
    }
    if (this.o2 <= 0) {
      this.blackout();
      return;
    }

    // ── Pickups (simple distance checks) ──
    for (const b of this.bubbles) {
      if (!b.alive) continue;
      if (Phaser.Math.Distance.Between(this.diver.x, this.diver.y, b.obj.x, b.obj.y) < 34) {
        b.alive = false;
        this.o2 = Math.min(O2_MAX, this.o2 + O2_BUBBLE);
        this.tweens.add({
          targets: b.obj, scale: 2, alpha: 0, duration: 220,
          onComplete: () => b.obj.destroy(),
        });
      }
    }
    if (time > this.invulnUntil) {
      for (const j of this.jellies) {
        if (!j.alive) continue;
        if (Phaser.Math.Distance.Between(this.diver.x, this.diver.y, j.obj.x, j.obj.y) < 36) {
          this.o2 = Math.max(0, this.o2 - O2_JELLY_HIT);
          this.stunUntil = time + 650;
          this.invulnUntil = time + 1300;
          this.body.setVelocity(this.body.velocity.x * -0.6, this.body.velocity.y * -0.6);
          this.cameras.main.shake(180, 0.012);
          this.tweens.add({ targets: this.diver, alpha: 0.35, duration: 120, yoyo: true, repeat: 4 });
          break;
        }
      }
    }

    // ── Surfacing ──
    if (this.state === 'diving' && depth <= 0.2 && this.maxDepth >= 5) {
      this.surfaced();
    }

    // ── Lighting & HUD ──
    const dark = Phaser.Math.Clamp((depth - 25) / 110, 0, 0.92);
    this.darkness.setAlpha(dark);
    this.glow.setPosition(this.diver.x, this.diver.y).setAlpha(dark > 0.1 ? Math.min(1, dark * 1.4) : 0);

    const o2Frac = this.o2 / O2_MAX;
    this.o2Fill.width = 196 * o2Frac;
    this.o2Fill.fillColor = o2Frac > 0.5 ? 0x4be3a0 : o2Frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.dangerVignette.setAlpha(o2Frac < 0.22 ? (0.22 - o2Frac) * 1.6 + Math.sin(time / 150) * 0.05 : 0);

    this.depthText.setText(`${depth.toFixed(0)} m`);
  }

  private surfaced(): void {
    this.state = 'breathing';
    const depth = Math.floor(this.maxDepth);
    const isRecord = saveBest(depth);
    this.bestText.setText(`best ${getBest()} m`);

    this.banner.setText(isRecord ? `NEW RECORD!\n−${depth} m 🏆` : `You surfaced!\n−${depth} m`);
    this.banner.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    // O₂ refills in update() while state === 'breathing' (gameplay values are
    // never tweened — tweens stall when the tab is backgrounded).
  }

  private blackout(): void {
    this.state = 'blackout';
    const depth = Math.floor(this.maxDepth);
    this.body.setAcceleration(0, 0);
    this.body.setVelocity(0, 20);
    this.cameras.main.fadeOut(900, 0, 2, 8);
    this.time.delayedCall(1000, () => {
      this.cameras.main.resetFX();
      this.cameras.main.fadeIn(600);
      this.darkness.setAlpha(0.96);
      this.glow.setAlpha(0);
      this.dangerVignette.setAlpha(0);

      this.banner.setText(`BLACKOUT 💫\n\nYou reached −${depth} m\nbut the ocean keeps\nwhat you don't bring back.`);
      this.banner.setFontSize(26).setAlpha(1).setScale(1);

      const retry = this.add.text(W / 2, 480, 'TAP TO BREATHE AGAIN', {
        fontFamily: 'monospace', fontSize: '22px', color: '#e8f4ff',
        backgroundColor: '#0d5c8c', padding: { x: 20, y: 12 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });

      const restart = () => this.scene.restart();
      retry.on('pointerdown', restart);
      this.input.keyboard?.once('keydown-SPACE', restart);
    });
  }
}
