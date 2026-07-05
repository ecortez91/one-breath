import Phaser from 'phaser';
import { makeTextures } from './textures';
import { getRecord, submitRecord } from './records';
import {
  W, PX_PER_M, SURFACE_Y, MAX_DEPTH_M, WORLD_H,
  buildOcean, buildLighting, updateLighting, type Lighting,
} from './world';

const O2_MAX = 100;
const O2_BASE_DRAIN = 2.2;
const O2_SWIM_DRAIN = 1.6;
const O2_TANK = 30; // a real tank is worth a lot more than a bubble
const O2_JELLY_HIT = 18;

type Pickup = { obj: Phaser.GameObjects.Image; alive: boolean };

export class CaveScene extends Phaser.Scene {
  private diver!: Phaser.GameObjects.Text;
  private body!: Phaser.Physics.Arcade.Body;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private o2 = O2_MAX;
  private maxDepth = 0;
  private state: 'diving' | 'blackout' | 'breathing' = 'diving';
  private stunUntil = 0;
  private invulnUntil = 0;

  private tanks: Pickup[] = [];
  private jellies: Pickup[] = [];
  private lighting!: Lighting;

  private o2Fill!: Phaser.GameObjects.Rectangle;
  private depthText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('cave');
  }

  create(): void {
    makeTextures(this);
    this.o2 = O2_MAX;
    this.maxDepth = 0;
    this.state = 'diving';
    this.tanks = [];
    this.jellies = [];

    buildOcean(this);
    this.buildDiver();
    this.buildPickups();
    this.lighting = buildLighting(this);
    this.buildHud();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.cameras.main.setBounds(0, 0, W, WORLD_H);
    this.cameras.main.startFollow(this.diver, false, 0.12, 0.12);
    this.cameras.main.fadeIn(400);
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
    // Gas tanks stashed down the water column — rarer than the old bubbles,
    // worth much more, and increasingly precious with depth
    let m = 8;
    while (m < MAX_DEPTH_M - 4) {
      const x = Phaser.Math.Between(50, W - 50);
      const y = SURFACE_Y + m * PX_PER_M + Phaser.Math.Between(-30, 30);
      const img = this.add.image(x, y, 'tank').setDepth(5);
      this.tweens.add({
        targets: img,
        y: y - 10,
        angle: Phaser.Math.Between(-8, 8),
        duration: Phaser.Math.Between(1600, 2400),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tanks.push({ obj: img, alive: true });
      m += Phaser.Math.FloatBetween(6, 9) + m / 25;
    }

    let jm = 12;
    while (jm < MAX_DEPTH_M - 2) {
      const x = Phaser.Math.Between(50, W - 50);
      const y = SURFACE_Y + jm * PX_PER_M;
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
      jm += Phaser.Math.FloatBetween(7, 12) - Math.min(4, jm / 30);
    }
  }

  private buildHud(): void {
    const hud = 100;
    this.add.rectangle(24, 24, 200, 22, 0x02121f, 0.75).setOrigin(0, 0.5).setScrollFactor(0).setDepth(hud);
    this.o2Fill = this.add.rectangle(26, 24, 196, 16, 0x4be3a0).setOrigin(0, 0.5).setScrollFactor(0).setDepth(hud + 1);
    this.add.text(24, 42, 'O₂', {
      fontFamily: 'monospace', fontSize: '13px', color: '#bcd9ea',
    }).setScrollFactor(0).setDepth(hud);

    this.depthText = this.add.text(W - 24, 16, '0 m', {
      fontFamily: 'monospace', fontSize: '26px', color: '#e8f4ff',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    const rec = getRecord('cave');
    this.bestText = this.add.text(W - 24, 48, rec.depth > 0 ? `🏆 ${rec.depth} m · ${rec.name}` : '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd166',
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
    const dt = Math.min(deltaMs, 50) / 1000;
    const depth = this.depthM();
    this.maxDepth = Math.max(this.maxDepth, depth);

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

    if (depth < 8) ay -= 60;
    else if (depth > 20) ay += 45;

    this.body.setAcceleration(ax, ay);
    if (this.body.velocity.x !== 0) this.diver.setFlipX(this.body.velocity.x < 0);

    if (this.state === 'breathing') {
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

    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (Phaser.Math.Distance.Between(this.diver.x, this.diver.y, t.obj.x, t.obj.y) < 36) {
        t.alive = false;
        this.o2 = Math.min(O2_MAX, this.o2 + O2_TANK);
        const label = this.add.text(t.obj.x, t.obj.y - 20, '+O₂', {
          fontFamily: 'monospace', fontSize: '20px', color: '#4be3a0', stroke: '#02121f', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({ targets: label, y: label.y - 40, alpha: 0, duration: 700, onComplete: () => label.destroy() });
        this.tweens.add({
          targets: t.obj, scale: 1.6, alpha: 0, duration: 220,
          onComplete: () => t.obj.destroy(),
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

    if (this.state === 'diving' && depth <= 0.2 && this.maxDepth >= 5) {
      this.surfaced();
    }

    updateLighting(this.lighting, depth, this.diver.x, this.diver.y);
    const o2Frac = this.o2 / O2_MAX;
    this.o2Fill.width = 196 * o2Frac;
    this.o2Fill.fillColor = o2Frac > 0.5 ? 0x4be3a0 : o2Frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.lighting.dangerVignette.setAlpha(o2Frac < 0.22 ? (0.22 - o2Frac) * 1.6 + Math.sin(time / 150) * 0.05 : 0);

    this.depthText.setText(`${depth.toFixed(0)} m`);
  }

  private surfaced(): void {
    this.state = 'breathing';
    const depth = Math.floor(this.maxDepth);
    const isRecord = submitRecord('cave', depth);
    const rec = getRecord('cave');
    this.bestText.setText(`🏆 ${rec.depth} m · ${rec.name}`);

    this.banner.setText(isRecord ? `NEW RECORD! 🏆\n−${depth} m — ${rec.name}` : `You surfaced!\n−${depth} m`);
    this.banner.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    // O₂ refills in update() while state === 'breathing'
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
      this.lighting.darkness.setAlpha(0.96);
      this.lighting.glow.setAlpha(0);
      this.lighting.dangerVignette.setAlpha(0);

      this.banner.setText(`OUT OF AIR 💫\n\nYou reached −${depth} m\nbut the ocean keeps\nwhat you don't bring back.`);
      this.banner.setFontSize(26).setAlpha(1).setScale(1);

      const retry = this.add.text(W / 2, 480, 'DIVE AGAIN', {
        fontFamily: 'monospace', fontSize: '22px', color: '#e8f4ff',
        backgroundColor: '#0d5c8c', padding: { x: 20, y: 12 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });
      const menu = this.add.text(W / 2, 545, 'MENU', {
        fontFamily: 'monospace', fontSize: '16px', color: '#8fc8e8',
        backgroundColor: '#02121f', padding: { x: 16, y: 8 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });

      retry.on('pointerdown', () => this.scene.restart());
      menu.on('pointerdown', () => this.scene.start('menu'));
      this.input.keyboard?.once('keydown-SPACE', () => this.scene.restart());
    });
  }
}
