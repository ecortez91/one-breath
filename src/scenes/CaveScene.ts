import Phaser from 'phaser';
import { makeTextures } from './textures';
import { addTreasure, getRecord, submitRecord } from './records';
import { diveAudio } from './audio';
import {
  W, PX_PER_M, SURFACE_Y, ZONES,
  buildOcean, buildLighting, updateLighting, worldHeight, type Lighting,
} from './world';

const O2_MAX = 100;
const O2_BASE_DRAIN = 2.2;
const O2_SWIM_DRAIN = 1.6;
const O2_BUBBLE = 14;

const MAX_M = 400; // sunlight zone, twilight zone, and the top of the dark
const WORLD_H = worldHeight(MAX_M);
const CAVE_START_M = 24; // open water above, cave walls below

// The deeper the cave, the worse its residents
const HAZARDS = [
  { fromM: 12, toM: 150, kind: 'jelly' as const, dmg: 18 },
  { fromM: 150, toM: 280, kind: '🦑', dmg: 26 },
  { fromM: 280, toM: 400, kind: '🦈', dmg: 35 },
];

type Pickup = { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text; alive: boolean; dmg: number };
type Treasure = { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text; alive: boolean; value: number };
type CaveBand = { m: number; gapX: number; gapW: number };

export class CaveScene extends Phaser.Scene {
  private diver!: Phaser.GameObjects.Sprite;
  private zonesSeen: number[] = [];
  private body!: Phaser.Physics.Arcade.Body;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private o2 = O2_MAX;
  private maxDepth = 0;
  private state: 'diving' | 'blackout' | 'breathing' = 'diving';
  private stunUntil = 0;
  private invulnUntil = 0;

  private bubbles: Pickup[] = [];
  private jellies: Pickup[] = [];
  private treasures: Treasure[] = [];
  private treasureHaul = 0;
  private haulText!: Phaser.GameObjects.Text;
  private prevSpeed = 0;
  private rockCooldownUntil = 0;
  private caveBands: CaveBand[] = [];
  private walls!: Phaser.Physics.Arcade.StaticGroup;
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
    this.bubbles = [];
    this.jellies = [];
    this.treasures = [];
    this.treasureHaul = 0;
    this.prevSpeed = 0;
    this.rockCooldownUntil = 0;
    this.caveBands = [];
    this.zonesSeen = [];

    buildOcean(this, MAX_M);
    this.buildDiver();
    this.buildCave();
    this.buildPickups();
    this.buildTreasures();
    this.lighting = buildLighting(this);
    this.buildHud();
    this.physics.add.collider(this.diver, this.walls, () => this.onRockHit());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.cameras.main.setBounds(0, 0, W, WORLD_H);
    this.cameras.main.startFollow(this.diver, false, 0.12, 0.12);
    this.cameras.main.fadeIn(400);

    this.input.on('pointerdown', () => diveAudio.init());
    const mute = this.add.text(W - 20, 780, diveAudio.muted ? '🔇' : '🔊', {
      fontSize: '22px', padding: { y: 6 },
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(105).setAlpha(0.8).setInteractive({ useHandCursor: true });
    mute.on('pointerdown', () => {
      diveAudio.init();
      mute.setText(diveAudio.toggleMute() ? '🔇' : '🔊');
    });
  }

  private buildDiver(): void {
    if (!this.anims.exists('fd-drift')) {
      const frames = Array.from({ length: 8 }, (_, i) => ({ key: 'fd-' + i }));
      this.anims.create({ key: 'fd-drift', frames, frameRate: 5, repeat: -1 });
      this.anims.create({ key: 'fd-swim', frames, frameRate: 26, repeat: 0 });
    }
    this.diver = this.add.sprite(W / 2, SURFACE_Y + 30, 'fd-straight').setOrigin(0.5).setDepth(10);
    this.physics.add.existing(this.diver);
    this.body = this.diver.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(52, 30, true);
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

  private buildCave(): void {
    // A winding corridor: every band places rock walls on both sides of a gap.
    // The gap wanders and narrows with depth.
    this.walls = this.physics.add.staticGroup();
    let gapX = W / 2;
    for (let m = CAVE_START_M; m < MAX_M - 4; m += Phaser.Math.FloatBetween(7, 10)) {
      const prog = m / MAX_M;
      const gapW = Phaser.Math.Linear(300, 150, prog);
      gapX = Phaser.Math.Clamp(
        gapX + Phaser.Math.Between(-80, 80),
        gapW / 2 + 34,
        W - gapW / 2 - 34,
      );
      this.caveBands.push({ m, gapX, gapW });

      const y = SURFACE_Y + m * PX_PER_M;
      const wallH = 84;
      const leftW = gapX - gapW / 2;
      const rightW = W - (gapX + gapW / 2);
      if (leftW > 8) this.wallSegment(leftW / 2, y, leftW, wallH);
      if (rightW > 8) this.wallSegment(W - rightW / 2, y, rightW, wallH);
    }
  }

  private wallSegment(cx: number, cy: number, w: number, h: number): void {
    // Physics body (invisible) + rock blobs on top for the visuals
    const zone = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
    this.walls.add(zone);
    const blobs = Math.max(1, Math.round(w / 80));
    for (let i = 0; i < blobs; i++) {
      const bx = cx - w / 2 + (i + 0.5) * (w / blobs);
      this.add.image(bx, cy + Phaser.Math.Between(-6, 6), 'rock')
        .setDisplaySize(w / blobs + 26, h + 18)
        .setFlipX(i % 2 === 1)
        .setDepth(4)
        .setAlpha(0.97);
    }
  }

  /** X range that is guaranteed open water at a given depth. */
  private corridorAt(m: number): { min: number; max: number } {
    if (m < CAVE_START_M) return { min: 50, max: W - 50 };
    let nearest: CaveBand = this.caveBands[0];
    for (const b of this.caveBands) {
      if (Math.abs(b.m - m) < Math.abs(nearest.m - m)) nearest = b;
    }
    return { min: nearest.gapX - nearest.gapW / 2 + 26, max: nearest.gapX + nearest.gapW / 2 - 26 };
  }

  private buildPickups(): void {
    // Air bubbles along the corridor: denser near the surface, sparse deep down
    let m = 4;
    while (m < MAX_M - 4) {
      const c = this.corridorAt(m);
      const x = Phaser.Math.Between(c.min, c.max);
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
      this.bubbles.push({ obj: img, alive: true, dmg: 0 });
      m += Phaser.Math.FloatBetween(2, 2.5) + (m / 30);
    }

    // Hazards: jellyfish in the shallows, squid in the twilight, sharks in the dark
    let jm = 12;
    while (jm < MAX_M - 2) {
      const hz = HAZARDS.find(h => jm >= h.fromM && jm < h.toM) ?? HAZARDS[HAZARDS.length - 1];
      const c = this.corridorAt(jm);
      const x = Phaser.Math.Between(c.min, c.max);
      const y = SURFACE_Y + jm * PX_PER_M;
      const obj = hz.kind === 'jelly'
        ? this.add.image(x, y, 'jelly').setDepth(6)
        : this.add.text(x, y, hz.kind, { fontSize: hz.kind === '🦈' ? '46px' : '40px', padding: { y: 12 } }).setOrigin(0.5).setDepth(6);
      const driftMax = Math.min(hz.kind === '🦈' ? 140 : 90, (c.max - c.min) / 2);
      const speed = hz.kind === '🦈' ? Phaser.Math.Between(1500, 2200) : Phaser.Math.Between(2200, 3600);
      const targetX = Phaser.Math.Clamp(x + Phaser.Math.Between(-driftMax, driftMax), c.min, c.max);
      if (hz.kind !== 'jelly') (obj as Phaser.GameObjects.Text).setFlipX(targetX > x);
      this.tweens.add({
        targets: obj,
        x: targetX,
        y: y - Phaser.Math.Between(20, 50),
        duration: speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onYoyo: () => { if (hz.kind !== 'jelly') (obj as Phaser.GameObjects.Text).setFlipX(!(obj as Phaser.GameObjects.Text).flipX); },
        onRepeat: () => { if (hz.kind !== 'jelly') (obj as Phaser.GameObjects.Text).setFlipX(targetX > x); },
      });
      this.jellies.push({ obj, alive: true, dmg: hz.dmg });
      jm += Phaser.Math.FloatBetween(7, 12) - Math.min(4, jm / 30);
    }
  }

  private buildTreasures(): void {
    // Coins in the shallows, gems in the twilight, crowns hiding in the dark.
    // Some sit right at the corridor's edge — worth more nerve to grab.
    let m = 10;
    while (m < MAX_M - 3) {
      const c = this.corridorAt(m);
      const risky = Math.random() < 0.4;
      const x = risky
        ? (Math.random() < 0.5 ? c.min + 6 : c.max - 6)
        : Phaser.Math.Between(c.min + 20, c.max - 20);
      const y = SURFACE_Y + m * PX_PER_M + Phaser.Math.Between(-16, 16);
      let obj: Treasure['obj'];
      let value: number;
      const roll = Math.random();
      if (m > 250 && roll < 0.18) {
        obj = this.add.text(x, y, '👑', { fontSize: '30px', padding: { y: 10 } }).setOrigin(0.5).setDepth(5);
        value = 20;
      } else if (m > 100 && roll < 0.45) {
        obj = this.add.text(x, y, '💎', { fontSize: '24px', padding: { y: 8 } }).setOrigin(0.5).setDepth(5);
        value = 5;
      } else {
        obj = this.add.image(x, y, 'coin').setDepth(5);
        value = 1;
      }
      this.tweens.add({
        targets: obj, y: y - 8, angle: value === 1 ? 12 : 0,
        duration: Phaser.Math.Between(1500, 2300), yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.treasures.push({ obj, alive: true, value });
      m += Phaser.Math.FloatBetween(10, 18);
    }
  }

  private onRockHit(): void {
    // A gentle brush is fine; slamming into rock at speed is not
    const now = this.time.now;
    if (now < this.rockCooldownUntil || this.prevSpeed < 150 || this.state !== 'diving') return;
    this.rockCooldownUntil = now + 900;
    const dmg = Math.min(14, 4 + (this.prevSpeed - 150) / 25);
    this.o2 = Math.max(0, this.o2 - dmg);
    diveAudio.thud();
    this.cameras.main.shake(150, 0.01);
    const t = this.add.text(this.diver.x, this.diver.y - 40, `rock! −${dmg.toFixed(0)} O₂`, {
      fontFamily: 'monospace', fontSize: '19px', color: '#ff9e6b', stroke: '#02121f', strokeThickness: 4,
      padding: { y: 6 },
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    this.tweens.add({ targets: this.diver, alpha: 0.4, duration: 100, yoyo: true, repeat: 2 });
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

    // The haul: what you're carrying — it only counts if you surface with it
    this.add.image(W - 100, 78, 'coin').setScale(0.7).setScrollFactor(0).setDepth(hud);
    this.haulText = this.add.text(W - 86, 70, '0', {
      fontFamily: 'monospace', fontSize: '16px', color: '#f2c94c',
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(hud);

    this.banner = this.add.text(W / 2, 220, '', {
      fontFamily: 'Georgia, serif', fontSize: '30px', color: '#e8f4ff',
      align: 'center', stroke: '#02121f', strokeThickness: 5, lineSpacing: 8,
      padding: { y: 10 },
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

    // Fins only move when he's actually swimming
    const moving = this.body.velocity.length() > 50;
    if (moving) {
      this.diver.play('fd-drift', true);
    } else if (this.diver.anims.isPlaying) {
      this.diver.stop();
      this.diver.setTexture('fd-straight');
    }

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

    for (const b of this.bubbles) {
      if (!b.alive) continue;
      if (Phaser.Math.Distance.Between(this.diver.x, this.diver.y, b.obj.x, b.obj.y) < 34) {
        b.alive = false;
        this.o2 = Math.min(O2_MAX, this.o2 + O2_BUBBLE);
        diveAudio.pop();
        this.tweens.add({
          targets: b.obj, scale: 2, alpha: 0, duration: 220,
          onComplete: () => b.obj.destroy(),
        });
      }
    }

    for (const tr of this.treasures) {
      if (!tr.alive) continue;
      if (Phaser.Math.Distance.Between(this.diver.x, this.diver.y, tr.obj.x, tr.obj.y) < 32) {
        tr.alive = false;
        this.treasureHaul += tr.value;
        this.haulText.setText(String(this.treasureHaul));
        if (tr.value >= 20) diveAudio.chime(); else diveAudio.pop();
        const label = this.add.text(tr.obj.x, tr.obj.y - 18, `+${tr.value}`, {
          fontFamily: 'monospace', fontSize: '18px', color: '#f2c94c', stroke: '#02121f', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({ targets: label, y: label.y - 36, alpha: 0, duration: 650, onComplete: () => label.destroy() });
        this.tweens.add({ targets: tr.obj, scale: 1.8, alpha: 0, duration: 200, onComplete: () => tr.obj.destroy() });
      }
    }
    // Zone announcements
    for (const z of ZONES) {
      if (z.m < MAX_M && depth > z.m && !this.zonesSeen.includes(z.m)) {
        this.zonesSeen.push(z.m);
        this.banner.setText(`— ${z.m} m —\n${z.label}`).setAlpha(1).setScale(0.8);
        this.tweens.add({ targets: this.banner, scale: 1, duration: 250, ease: 'Back.easeOut' });
        this.tweens.add({ targets: this.banner, alpha: 0, duration: 500, delay: 1700 });
      }
    }

    if (time > this.invulnUntil) {
      for (const j of this.jellies) {
        if (!j.alive) continue;
        if (Phaser.Math.Distance.Between(this.diver.x, this.diver.y, j.obj.x, j.obj.y) < 38) {
          this.o2 = Math.max(0, this.o2 - j.dmg);
          diveAudio.thud();
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
    diveAudio.setDepth(depth);
    diveAudio.setHeart(this.o2 < 25 ? 80 : 62, this.o2 < 25 ? 0.9 : 0.35);
    const o2Frac = this.o2 / O2_MAX;
    this.o2Fill.width = 196 * o2Frac;
    this.o2Fill.fillColor = o2Frac > 0.5 ? 0x4be3a0 : o2Frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.lighting.dangerVignette.setAlpha(o2Frac < 0.22 ? (0.22 - o2Frac) * 1.6 + Math.sin(time / 150) * 0.05 : 0);

    this.depthText.setText(`${depth.toFixed(0)} m`);
    this.prevSpeed = this.body.velocity.length();
  }

  private surfaced(): void {
    this.state = 'breathing';
    this.lighting.dangerVignette.setAlpha(0);
    const depth = Math.floor(this.maxDepth);
    const isRecord = submitRecord('cave', depth);
    const rec = getRecord('cave');
    this.bestText.setText(`🏆 ${rec.depth} m · ${rec.name}`);

    let treasureLine = '';
    if (this.treasureHaul > 0) {
      const total = addTreasure(this.treasureHaul);
      treasureLine = `\n+${this.treasureHaul} treasure banked · ${total} total`;
      this.treasureHaul = 0;
      this.haulText.setText('0');
      diveAudio.chime();
    }

    this.banner.setText((isRecord ? `NEW RECORD! 🏆\n−${depth} m — ${rec.name}` : `You surfaced!\n−${depth} m`) + treasureLine);
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

      const lost = this.treasureHaul > 0 ? `\n…and your ${this.treasureHaul} treasure.` : '';
      this.banner.setText(`OUT OF AIR 💫\n\nYou reached −${depth} m\nbut the ocean keeps\nwhat you don't bring back.${lost}`);
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
