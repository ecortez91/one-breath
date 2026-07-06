import Phaser from 'phaser';
import { makeTextures } from './textures';
import { getRecord, submitRecord } from './records';
import {
  W, PX_PER_M, SURFACE_Y, ZONES,
  buildOcean, buildLighting, updateLighting, type Lighting,
} from './world';

const MAX_M = 1000; // to the midnight zone — nobody has survived it yet

const O2_MAX = 100;
const O2_DRAIN = 1.7; // per second
const O2_MISS = 2.5; // cue sails past untapped
const O2_WASTED_TAP = 1.5; // tap with no cue in the window

const HIT_Y = 640; // screen y of the hit zone
const LANE_X = 424; // screen x of the rhythm lane
const PERFECT_MS = 75;
const GOOD_MS = 160;

type Cue = { img: Phaser.GameObjects.Image; judged: boolean };

export class FreediveScene extends Phaser.Scene {
  private diver!: Phaser.GameObjects.Sprite;
  private lighting!: Lighting;
  private zonesSeen: number[] = [];

  private depth = 0;
  private maxDepth = 0;
  private vel = 0; // m/s along current direction
  private turned = false;
  private o2 = O2_MAX;
  private state: 'diving' | 'blackout' | 'done' = 'diving';
  private combo = 0;
  private flowActive = false;
  private passedRecord = false;

  private cues: Cue[] = [];
  private cueSpeed = 240; // px/s, grows with depth
  private nextCueAt = 0;
  private pairPhase = false; // cues come in pairs: kick-kick... glide

  private o2Fill!: Phaser.GameObjects.Rectangle;
  private depthText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private turnBtn!: Phaser.GameObjects.Container;
  private dangerV!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('freedive');
  }

  create(): void {
    makeTextures(this);
    this.depth = 0;
    this.maxDepth = 0;
    this.vel = 0;
    this.turned = false;
    this.o2 = O2_MAX;
    this.state = 'diving';
    this.combo = 0;
    this.flowActive = false;
    this.passedRecord = false;
    this.cues = [];
    this.nextCueAt = 0;
    this.pairPhase = false;
    this.zonesSeen = [];

    buildOcean(this, MAX_M);

    // Animated freediver: slow drift undulation always, a full fast wave per kick
    if (!this.anims.exists('fd-drift')) {
      const frames = Array.from({ length: 8 }, (_, i) => ({ key: 'fd-' + i }));
      this.anims.create({ key: 'fd-drift', frames, frameRate: 5, repeat: -1 });
      this.anims.create({ key: 'fd-swim', frames, frameRate: 26, repeat: 0 });
    }
    this.diver = this.add.sprite(180, SURFACE_Y + 20, 'fd-0')
      .setOrigin(0.5).setDepth(10).setRotation(Math.PI / 2).setScale(1.1);
    this.diver.play('fd-drift');
    this.diver.on(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'fd-swim', () => {
      if (this.diver.active) this.diver.play('fd-drift');
    });

    this.lighting = buildLighting(this);
    this.dangerV = this.lighting.dangerVignette;

    this.buildLane();
    this.buildHud();

    this.cameras.main.setBounds(0, 0, W, Number.MAX_SAFE_INTEGER);
    this.cameras.main.startFollow(this.diver, false, 0.15, 0.15);
    this.cameras.main.fadeIn(400);

    // Tap anywhere = kick; SPACE too. The TURN button marks itself handled.
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over.length > 0) return; // tapped a button
      this.tryKick();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tryKick());
  }

  private buildLane(): void {
    const laneTop = 120;
    this.add.rectangle(LANE_X, (laneTop + HIT_Y + 60) / 2, 52, HIT_Y - laneTop + 120, 0x02121f, 0.45)
      .setScrollFactor(0).setDepth(90);
    // Hit zone
    this.add.circle(LANE_X, HIT_Y, 27, 0xffffff, 0).setStrokeStyle(4, 0xe8f4ff, 0.9)
      .setScrollFactor(0).setDepth(92);
    this.add.text(LANE_X, HIT_Y + 44, 'KICK', {
      fontFamily: 'monospace', fontSize: '13px', color: '#8fc8e8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(92);
  }

  private buildHud(): void {
    const hud = 100;
    this.add.rectangle(24, 24, 200, 22, 0x02121f, 0.75).setOrigin(0, 0.5).setScrollFactor(0).setDepth(hud);
    this.o2Fill = this.add.rectangle(26, 24, 196, 16, 0x4be3a0).setOrigin(0, 0.5).setScrollFactor(0).setDepth(hud + 1);
    this.add.text(24, 42, 'O₂', { fontFamily: 'monospace', fontSize: '13px', color: '#bcd9ea' })
      .setScrollFactor(0).setDepth(hud);

    this.depthText = this.add.text(W - 70, 16, '0 m', {
      fontFamily: 'monospace', fontSize: '26px', color: '#e8f4ff',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    const rec = getRecord('freedive');
    this.add.text(W - 70, 48, rec.depth > 0 ? `🏆 ${rec.depth} m · ${rec.name}` : '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd166',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    this.comboText = this.add.text(24, 66, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#4be3a0',
    }).setScrollFactor(0).setDepth(hud);

    this.phaseText = this.add.text(24, 90, '▼ descending', {
      fontFamily: 'monospace', fontSize: '14px', color: '#8fc8e8',
    }).setScrollFactor(0).setDepth(hud);

    this.banner = this.add.text(W / 2 - 40, 240, '', {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#e8f4ff',
      align: 'center', stroke: '#02121f', strokeThickness: 5, lineSpacing: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hud + 2);

    // TURN button: big, amber, impossible to miss
    const circle = this.add.circle(0, 0, 52, 0xd97706, 0.95).setStrokeStyle(4, 0xffd166, 1);
    const label = this.add.text(0, 0, '⤴\nTURN', {
      fontFamily: 'monospace', fontSize: '19px', color: '#ffffff', align: 'center', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.turnBtn = this.add.container(72, HIT_Y - 6, [circle, label]).setScrollFactor(0).setDepth(95);
    circle.setInteractive({ useHandCursor: true });
    circle.on('pointerdown', () => this.turnAround());
    this.input.keyboard?.on('keydown-T', () => this.turnAround());
    this.tweens.add({ targets: this.turnBtn, scale: 1.07, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // How-to hint at dive start
    this.flashBanner('Tap to the rhythm 🎵\nkick · kick · glide\n\n⤴ TURN to head home', 2600);
  }

  private turnAround(): void {
    if (this.turned || this.state !== 'diving') return;
    this.turned = true;
    this.vel = 0;
    this.diver.setRotation(-Math.PI / 2); // heading up now
    this.turnBtn.setVisible(false);
    this.phaseText.setText('▲ ascending').setColor('#4be3a0');
    this.flashBanner('Heading up!\nKeep the rhythm.');
  }

  private playKickAnim(): void {
    // One full dolphin-wave cycle, fast, then back to the lazy drift
    this.diver.play('fd-swim');
  }

  private flashBanner(text: string, hold = 900): void {
    this.banner.setText(text).setAlpha(1).setScale(0.7);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.time.delayedCall(hold, () => {
      if (this.state === 'diving') this.tweens.add({ targets: this.banner, alpha: 0, duration: 350 });
    });
  }

  private popup(text: string, color: string): void {
    const t = this.add.text(this.diver.x, this.diver.y - 46, text, {
      fontFamily: 'monospace', fontSize: '22px', color, stroke: '#02121f', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  private tryKick(): void {
    if (this.state !== 'diving') return;
    // Nearest unjudged cue by timing distance to the hit line
    let best: Cue | null = null;
    let bestMs = Infinity;
    for (const c of this.cues) {
      if (c.judged) continue;
      const ms = Math.abs((c.img.y - HIT_Y) / this.cueSpeed) * 1000;
      if (ms < bestMs) { bestMs = ms; best = c; }
    }
    if (!best || bestMs > GOOD_MS + 120) {
      // flailing in the water
      this.o2 = Math.max(0, this.o2 - O2_WASTED_TAP);
      this.breakFlow();
      this.popup('too soon!', '#ff9e9e');
      return;
    }
    best.judged = true;
    const perfect = bestMs <= PERFECT_MS;
    const good = bestMs <= GOOD_MS;
    if (!good) {
      this.o2 = Math.max(0, this.o2 - O2_WASTED_TAP);
      this.breakFlow();
      this.popup('weak kick', '#ffd166');
      this.killCue(best, 0xffd166);
      this.vel += 0.35;
      this.playKickAnim();
      return;
    }
    this.combo++;
    const comboBonus = Math.min(0.5, Math.floor(this.combo / 5) * 0.1);
    const flowBonus = this.flowActive ? 1.15 : 1;
    this.vel += (perfect ? 2.6 : 1.7) * (1 + comboBonus) * flowBonus;
    this.popup(perfect ? 'PERFECT!' : 'good', perfect ? '#4be3a0' : '#bcd9ea');
    this.killCue(best, perfect ? 0x4be3a0 : 0x8fc8e8);
    this.playKickAnim();

    // FLOW STATE: long combo = the dive clicks into place
    if (!this.flowActive && this.combo >= 12) {
      this.flowActive = true;
      this.diver.setTint(0x9fe8ff);
      this.popup('FLOW STATE 🌊', '#8fd8ff');
      this.flashBanner('FLOW STATE\nkicks hit harder', 1100);
    }
  }

  private breakFlow(): void {
    this.combo = 0;
    if (this.flowActive) {
      this.flowActive = false;
      this.diver.clearTint();
      this.popup('flow lost', '#8fa8b8');
    }
  }

  private killCue(c: Cue, tint: number): void {
    c.img.setTint(tint);
    this.tweens.add({ targets: c.img, scale: 1.7, alpha: 0, duration: 200, onComplete: () => c.img.destroy() });
  }

  update(time: number, deltaMs: number): void {
    if (this.state !== 'diving') return;
    const dt = Math.min(deltaMs, 50) / 1000;

    // ── Spawn cues in pairs (kick-kick ... glide), harder with depth ──
    if (time >= this.nextCueAt) {
      const img = this.add.image(LANE_X, 90, 'cue').setScrollFactor(0).setDepth(91);
      this.cues.push({ img, judged: false });
      if (!this.pairPhase) {
        // second kick of the pair lands close behind
        this.nextCueAt = time + Phaser.Math.Clamp(400 - this.maxDepth, 260, 400);
      } else {
        // glide phase before the next pair
        const base = Phaser.Math.Clamp(1250 - this.maxDepth * 7, 560, 1250);
        const jitter = this.maxDepth > 45 ? Phaser.Math.FloatBetween(0.85, 1.2) : 1;
        this.nextCueAt = time + base * jitter;
      }
      this.pairPhase = !this.pairPhase;
    }
    this.cueSpeed = 240 + this.maxDepth * 2;

    // ── Move cues; misses hurt ──
    for (const c of this.cues) {
      if (!c.img.active) continue;
      c.img.y += this.cueSpeed * dt;
      if (!c.judged && c.img.y > HIT_Y + (GOOD_MS / 1000) * this.cueSpeed + 8) {
        c.judged = true;
        this.o2 = Math.max(0, this.o2 - O2_MISS);
        this.breakFlow();
        this.popup('missed', '#ff5d5d');
        this.killCue(c, 0xff5d5d);
      }
    }
    this.cues = this.cues.filter(c => c.img.active);

    // ── Record chase ──
    const rec = getRecord('freedive');
    if (!this.turned && !this.passedRecord && rec.depth > 0 && this.depth > rec.depth) {
      this.passedRecord = true;
      this.popup('🏆 NEW TERRITORY', '#ffd166');
      this.cameras.main.flash(300, 255, 209, 102, false);
    }

    // ── Physics: kicks build velocity, water drag bleeds it ──
    this.vel *= Math.exp(-1.3 * dt);
    let passive = 0;
    if (!this.turned && this.depth > 20) passive = 0.8; // freefall
    if (this.turned && this.depth < 12) passive = 0.7; // positive buoyancy
    const dir = this.turned ? -1 : 1;
    this.depth = Math.max(0, this.depth + (this.vel + passive) * dir * dt);
    this.maxDepth = Math.max(this.maxDepth, this.depth);
    this.diver.y = SURFACE_Y + 20 + this.depth * PX_PER_M;

    // ── O₂: effort grows with depth, flow state = efficiency ──
    const depthLoad = Math.min(this.depth, 120) / 90;
    this.o2 -= (O2_DRAIN + depthLoad) * (this.flowActive ? 0.78 : 1) * dt;
    if (this.o2 <= 0) return this.blackout();

    // ── Zone crossings ──
    if (!this.turned) {
      for (const z of ZONES) {
        if (this.depth > z.m && !this.zonesSeen.includes(z.m)) {
          this.zonesSeen.push(z.m);
          this.flashBanner(`— ${z.m} m —\n${z.label}`, 1600);
          this.cameras.main.flash(400, 20, 40, 80, false);
        }
      }
    }

    // ── Surfaced? ──
    if (this.turned && this.depth <= 0.05 && this.maxDepth >= 3) return this.surfaced();

    // ── HUD / lighting ──
    updateLighting(this.lighting, this.depth, this.diver.x, this.diver.y);
    const frac = this.o2 / O2_MAX;
    this.o2Fill.width = 196 * frac;
    this.o2Fill.fillColor = frac > 0.5 ? 0x4be3a0 : frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.dangerV.setAlpha(frac < 0.22 ? (0.22 - frac) * 1.6 + Math.sin(time / 150) * 0.05 : 0);
    this.depthText.setText(`${this.depth.toFixed(0)} m`);
    this.comboText.setText(this.combo >= 3 ? `combo ×${this.combo}` : '');
  }

  private surfaced(): void {
    this.state = 'done';
    const depth = Math.floor(this.maxDepth);
    const isRecord = submitRecord('freedive', depth);
    const rec = getRecord('freedive');
    this.showEnd(
      isRecord ? `NEW RECORD! 🏆\n−${depth} m — ${rec.name}` : `Clean dive!\n−${depth} m\n\n🏆 ${rec.depth} m · ${rec.name}`,
      'DIVE AGAIN',
    );
  }

  private blackout(): void {
    this.state = 'blackout';
    const depth = Math.floor(this.maxDepth);
    this.cameras.main.fadeOut(900, 0, 2, 8);
    this.time.delayedCall(1000, () => {
      this.cameras.main.resetFX();
      this.cameras.main.fadeIn(600);
      this.lighting.darkness.setAlpha(0.96);
      this.dangerV.setAlpha(0);
      const rec = getRecord('freedive');
      this.showEnd(
        `BLACKOUT 💫\n\nYou touched −${depth} m\nbut never brought it home.` +
        (rec.depth > 0 ? `\n\n🏆 ${rec.depth} m · ${rec.name}` : ''),
        'BREATHE & RETRY',
      );
    });
  }

  private showEnd(text: string, btnLabel: string): void {
    this.banner.setText(text).setFontSize(24).setAlpha(1).setScale(1).setPosition(W / 2, 300);
    const retry = this.add.text(W / 2, 520, btnLabel, {
      fontFamily: 'monospace', fontSize: '22px', color: '#e8f4ff',
      backgroundColor: '#0d5c8c', padding: { x: 20, y: 12 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });
    const menu = this.add.text(W / 2, 585, 'MENU', {
      fontFamily: 'monospace', fontSize: '16px', color: '#8fc8e8',
      backgroundColor: '#02121f', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });
    retry.on('pointerdown', () => this.scene.restart());
    menu.on('pointerdown', () => this.scene.start('menu'));
  }
}
