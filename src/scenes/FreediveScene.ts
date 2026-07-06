import Phaser from 'phaser';
import { makeTextures } from './textures';
import { getRecord, submitRecord } from './records';
import { diveAudio } from './audio';
import {
  W, PX_PER_M, SURFACE_Y, ZONES, MILESTONES, titleFor,
  buildOcean, buildLighting, updateLighting, type Lighting,
} from './world';

const MAX_M = 1000; // to the midnight zone — nobody has survived it yet
const FREEFALL_AT = 32; // past neutral buoyancy you stop kicking and sink

const O2_MAX = 100;
// Real dives are three acts with very different price tags:
const DRAIN_KICK = 1.6; // descent kicking
const DRAIN_FREEFALL = 0.6; // streamlined sinking is nearly free
const DRAIN_ASCENT = 2.2; // the swim home is where the O2 goes
const O2_MISS = 2.5;
const O2_WASTED_TAP = 1.5;
const O2_URGE_TAPPED = 5; // fighting a contraction costs you
const O2_POSTURE_MISS = 1.5;

const HIT_Y = 640;
const LANE_X = 424;
const PERFECT_MS = 75;
const GOOD_MS = 160;

type CueType = 'kick' | 'posture' | 'urge';
type Cue = { img: Phaser.GameObjects.Image; judged: boolean; type: CueType };
type Phase = 'kick' | 'freefall' | 'ascent';

export class FreediveScene extends Phaser.Scene {
  private diver!: Phaser.GameObjects.Sprite;
  private lighting!: Lighting;
  private zonesSeen: number[] = [];
  private milestonesSeen: number[] = [];

  private depth = 0;
  private maxDepth = 0;
  private vel = 0;
  private phase: Phase = 'kick';
  private o2 = O2_MAX;
  private state: 'ready' | 'diving' | 'protocol' | 'blackout' | 'done' = 'ready';
  private bobTween?: Phaser.Tweens.Tween;
  private fins: 'mono' | 'bi' = (localStorage.getItem('onebreath_fins') as 'mono' | 'bi') || 'mono';
  private finButtons: Phaser.GameObjects.Text[] = [];
  private stillRing?: Phaser.GameObjects.Arc;
  private protocolTaps = 0;
  private protocolDeadline = 0;
  private protocolText?: Phaser.GameObjects.Text;
  private combo = 0;
  private flowActive = false;
  private passedRecord = false;
  private postureMult = 1;
  private postureUntil = 0;
  private turnWarned = false;

  private cues: Cue[] = [];
  private cueSpeed = 240;
  private nextCueAt = 0;
  private pairPhase = false;
  private nextUrgeAt = 0;

  private o2Fill!: Phaser.GameObjects.Rectangle;
  private costMarker!: Phaser.GameObjects.Rectangle;
  private depthText!: Phaser.GameObjects.Text;
  private nextMsText!: Phaser.GameObjects.Text;
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
    this.phase = 'kick';
    this.o2 = O2_MAX;
    this.state = 'ready';
    this.combo = 0;
    this.flowActive = false;
    this.passedRecord = false;
    this.postureMult = 1;
    this.postureUntil = 0;
    this.turnWarned = false;
    this.cues = [];
    this.nextCueAt = 0;
    this.pairPhase = false;
    this.nextUrgeAt = 0;
    this.zonesSeen = [];
    this.milestonesSeen = [];
    this.finButtons = [];
    this.stillRing = undefined;
    this.protocolText = undefined;
    this.protocolTaps = 0;

    buildOcean(this, MAX_M);

    for (const pre of ['fd', 'bf']) {
      if (!this.anims.exists(pre + '-drift')) {
        const frames = Array.from({ length: 8 }, (_, i) => ({ key: pre + '-' + i }));
        this.anims.create({ key: pre + '-drift', frames, frameRate: 5, repeat: -1 });
        this.anims.create({ key: pre + '-swim', frames, frameRate: pre === 'bf' ? 30 : 26, repeat: 0 });
      }
    }

    // Breathe-up: chilling at the surface until the first tap.
    // Random idle pose — floating face-down with a snorkel, or bobbing upright.
    const floating = Math.random() < 0.5;
    this.diver = this.add.sprite(
      180,
      floating ? SURFACE_Y - 4 : SURFACE_Y + 16,
      (this.fins === 'mono' ? 'fd' : 'bf') + (floating ? '-float' : '-straight'),
    ).setOrigin(0.5).setDepth(10).setScale(1.1);
    if (!floating) this.diver.setRotation(-Math.PI / 2); // upright, head above water
    this.bobTween = this.tweens.add({
      targets: this.diver,
      y: this.diver.y + 4,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // A kick waves the body once, then back to a still streamline
    for (const pre of ['fd', 'bf']) {
      this.diver.on(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + pre + '-swim', () => {
        if (this.diver.active) { this.diver.stop(); this.diver.setTexture(this.finPrefix() + '-straight'); }
      });
    }

    this.lighting = buildLighting(this);
    this.dangerV = this.lighting.dangerVignette;

    this.buildLane();
    this.buildHud();

    this.cameras.main.setBounds(0, 0, W, Number.MAX_SAFE_INTEGER);
    this.cameras.main.startFollow(this.diver, false, 0.15, 0.15);
    this.cameras.main.fadeIn(400);

    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: unknown[]) => {
      diveAudio.init();
      if (over.length > 0) return;
      if (this.state === 'ready') return this.startDive();
      if (this.state === 'protocol') return this.protocolTap();
      this.tryKick();
    });
    this.input.keyboard?.on('keydown-SPACE', () => {
      diveAudio.init();
      if (this.state === 'ready') return this.startDive();
      if (this.state === 'protocol') return this.protocolTap();
      this.tryKick();
    });
  }

  private buildLane(): void {
    const laneTop = 120;
    this.add.rectangle(LANE_X, (laneTop + HIT_Y + 60) / 2, 52, HIT_Y - laneTop + 120, 0x02121f, 0.45)
      .setScrollFactor(0).setDepth(90);
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
    // The calculation, made visible: estimated O2 needed to swim home
    this.costMarker = this.add.rectangle(26, 24, 3, 22, 0xffffff, 0.95).setOrigin(0.5).setScrollFactor(0).setDepth(hud + 2);
    this.add.text(24, 42, 'O₂  (▎= est. cost of the swim home)', {
      fontFamily: 'monospace', fontSize: '12px', color: '#bcd9ea',
    }).setScrollFactor(0).setDepth(hud);

    this.depthText = this.add.text(W - 70, 16, '0 m', {
      fontFamily: 'monospace', fontSize: '26px', color: '#e8f4ff',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    const rec = getRecord('freedive');
    this.add.text(W - 70, 48, rec.depth > 0 ? `🏆 ${rec.depth} m · ${rec.name}` : '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd166',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    this.nextMsText = this.add.text(W - 70, 68, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#8fc8e8',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hud);

    this.comboText = this.add.text(24, 62, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#4be3a0',
    }).setScrollFactor(0).setDepth(hud);

    this.phaseText = this.add.text(24, 86, '▼ kicking down', {
      fontFamily: 'monospace', fontSize: '14px', color: '#8fc8e8',
    }).setScrollFactor(0).setDepth(hud);

    this.banner = this.add.text(W / 2 - 40, 240, '', {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#e8f4ff',
      align: 'center', stroke: '#02121f', strokeThickness: 5, lineSpacing: 8,
      padding: { y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hud + 2);

    const circle = this.add.circle(0, 0, 52, 0xd97706, 0.95).setStrokeStyle(4, 0xffd166, 1);
    const label = this.add.text(0, 0, '⤴\nTURN', {
      fontFamily: 'monospace', fontSize: '19px', color: '#ffffff', align: 'center', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.turnBtn = this.add.container(72, HIT_Y - 6, [circle, label]).setScrollFactor(0).setDepth(95);
    circle.setInteractive({ useHandCursor: true });
    circle.on('pointerdown', () => this.turnAround());
    this.input.keyboard?.on('keydown-T', () => this.turnAround());
    this.tweens.add({ targets: this.turnBtn, scale: 1.07, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.turnBtn.setVisible(false); // appears once the dive starts

    this.banner.setText('breathe up...\n\nTAP when you are ready\nto take the one breath').setAlpha(1);

    // Equipment choice while breathing up
    const mkFinBtn = (x: number, kind: 'mono' | 'bi', label: string) => {
      const btn = this.add.text(x, 700, label, {
        fontFamily: 'monospace', fontSize: '16px', color: '#e8f4ff',
        backgroundColor: '#0d5c8c', padding: { x: 14, y: 10 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(96).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.pickFins(kind));
      this.finButtons.push(btn);
      return btn;
    };
    mkFinBtn(W / 2 - 90, 'mono', 'MONOFIN');
    mkFinBtn(W / 2 + 90, 'bi', 'BIFINS');
    this.refreshFinButtons();

    // Mute toggle
    const mute = this.add.text(W - 20, 780, diveAudio.muted ? '🔇' : '🔊', {
      fontSize: '22px', padding: { y: 6 },
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(96).setAlpha(0.8).setInteractive({ useHandCursor: true });
    mute.on('pointerdown', () => {
      diveAudio.init();
      mute.setText(diveAudio.toggleMute() ? '🔇' : '🔊');
    });
  }

  private finPrefix(): string {
    return this.fins === 'mono' ? 'fd' : 'bf';
  }

  private pickFins(kind: 'mono' | 'bi'): void {
    if (this.state !== 'ready') return;
    this.fins = kind;
    localStorage.setItem('onebreath_fins', kind);
    const floating = this.diver.texture.key.endsWith('-float');
    this.diver.setTexture(this.finPrefix() + (floating ? '-float' : '-straight'));
    this.refreshFinButtons();
  }

  private refreshFinButtons(): void {
    this.finButtons.forEach(b => {
      const active = (b.text === 'MONOFIN') === (this.fins === 'mono');
      b.setBackgroundColor(active ? '#d97706' : '#0d5c8c').setColor(active ? '#ffffff' : '#9fc4dc');
    });
  }

  private startDive(): void {
    this.state = 'diving';
    this.bobTween?.remove();
    this.turnBtn.setVisible(true);
    this.finButtons.forEach(b => b.setVisible(false));
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 300 });
    // Duck dive: tip from the surface pose into a head-down streamline
    this.tweens.add({
      targets: this.diver,
      rotation: Math.PI / 2,
      y: SURFACE_Y + 20,
      duration: 450,
      ease: 'Sine.easeInOut',
      onComplete: () => this.diver.setTexture(this.finPrefix() + '-straight'),
    });
    this.nextCueAt = this.time.now + 1000;
    this.flashBanner(
      this.fins === 'bi'
        ? 'kick · kick · glide 🎵\nfreefall waits at −32 m'
        : 'one strong stroke · glide 🎵\nfreefall waits at −32 m',
      1800,
    );
  }

  private estimatedCost(): number {
    // Conservative estimate of the O2 the ascent will take (~0.85%/m)
    return Math.min(100, this.depth * 0.85);
  }

  private nextMilestone(): { m: number; title: string } | null {
    for (const ms of MILESTONES) {
      if (this.maxDepth < ms.m) return ms;
    }
    return null;
  }

  private turnAround(): void {
    if (this.phase === 'ascent' || this.state !== 'diving') return;
    this.phase = 'ascent';
    this.vel = 0;
    this.turnBtn.setVisible(false);
    this.phaseText.setText('▲ the swim home').setColor('#4be3a0');

    // The turn: pike, arc sideways, come around head-up — like at the plate
    const d = Math.floor(this.depth);
    this.popup(`🏷️ −${d} m`, '#ffd166');
    this.tweens.add({
      targets: this.diver,
      rotation: -Math.PI / 2,
      x: this.diver.x + 34,
      scaleY: 0.82,
      duration: 520,
      ease: 'Sine.easeInOut',
      yoyo: false,
      onComplete: () => {
        this.diver.setScale(1.1);
        this.tweens.add({ targets: this.diver, x: 180, duration: 400, ease: 'Sine.easeOut' });
      },
    });
    // burst of bubbles at the turn
    for (let i = 0; i < 7; i++) {
      const b = this.add.image(this.diver.x + Phaser.Math.Between(-16, 16), this.diver.y + Phaser.Math.Between(-12, 12), 'bubble')
        .setScale(0.3).setAlpha(0.8).setDepth(9);
      this.tweens.add({
        targets: b, y: b.y - Phaser.Math.Between(60, 120), alpha: 0, scale: 0.12,
        duration: Phaser.Math.Between(700, 1200), onComplete: () => b.destroy(),
      });
    }
    this.flashBanner('The only way out\nis up. Kick!');
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
      padding: { y: 6 },
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  private spawnCue(type: CueType): void {
    const img = this.add.image(LANE_X, 90, 'cue').setScrollFactor(0).setDepth(91);
    if (type === 'posture') img.setTint(0x8fd8ff).setScale(0.85);
    if (type === 'urge') img.setTint(0xff5d5d).setScale(1.15);
    this.cues.push({ img, judged: false, type });
  }

  private tryKick(): void {
    if (this.state !== 'diving') return;
    let best: Cue | null = null;
    let bestMs = Infinity;
    for (const c of this.cues) {
      if (c.judged) continue;
      const ms = Math.abs((c.img.y - HIT_Y) / this.cueSpeed) * 1000;
      if (ms < bestMs) { bestMs = ms; best = c; }
    }
    if (!best || bestMs > GOOD_MS + 120) {
      this.o2 = Math.max(0, this.o2 - O2_WASTED_TAP);
      this.breakFlow();
      this.popup('too soon!', '#ff9e9e');
      return;
    }

    // Contractions must be resisted, not fought
    if (best.type === 'urge') {
      best.judged = true;
      this.o2 = Math.max(0, this.o2 - O2_URGE_TAPPED);
      this.breakFlow();
      this.popup('fought the urge! −O₂', '#ff5d5d');
      this.killCue(best, 0xff5d5d);
      this.cameras.main.shake(140, 0.008);
      diveAudio.thud();
      return;
    }

    best.judged = true;
    const perfect = bestMs <= PERFECT_MS;
    const good = bestMs <= GOOD_MS;

    if (best.type === 'posture') {
      if (good) {
        this.popup(perfect ? 'streamline ✓' : 'adjusted', '#8fd8ff');
        this.killCue(best, 0x8fd8ff);
        this.postureMult = 1.18;
        this.postureUntil = this.time.now + 4000;
      } else {
        this.popup('wobble', '#ffd166');
        this.killCue(best, 0xffd166);
      }
      return;
    }

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
    // Monofin: fewer, stronger strokes. Bifins: lighter kicks in pairs.
    const impulse = this.fins === 'mono' ? (perfect ? 3.4 : 2.2) : (perfect ? 2.0 : 1.3);
    this.vel += impulse * (1 + comboBonus) * flowBonus;
    this.popup(perfect ? 'PERFECT!' : 'good', perfect ? '#4be3a0' : '#bcd9ea');
    this.killCue(best, perfect ? 0x4be3a0 : 0x8fc8e8);
    this.playKickAnim();
    diveAudio.kick(perfect);

    // Stillness: not excitement — the opposite. Everything goes quiet.
    if (!this.flowActive && this.combo >= 12) {
      this.flowActive = true;
      this.popup('everything goes quiet…', '#b8d4e2');
      this.stillRing = this.add.circle(this.diver.x, this.diver.y, 52, 0xffffff, 0)
        .setStrokeStyle(2, 0xcfe8f2, 0.22).setDepth(9);
      this.tweens.add({
        targets: this.stillRing, scale: 1.25, alpha: 0.45,
        duration: 3600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  private breakFlow(): void {
    this.combo = 0;
    if (this.flowActive) {
      this.flowActive = false;
      this.stillRing?.destroy();
      this.stillRing = undefined;
      this.popup('the mind wanders', '#8fa8b8');
    }
  }

  private playKickAnim(): void {
    this.diver.play(this.finPrefix() + '-swim');
  }

  private killCue(c: Cue, tint: number): void {
    c.img.setTint(tint);
    this.tweens.add({ targets: c.img, scale: 1.7, alpha: 0, duration: 200, onComplete: () => c.img.destroy() });
  }

  update(time: number, deltaMs: number): void {
    if (this.state !== 'diving') return;
    const dt = Math.min(deltaMs, 50) / 1000;

    // ── Cue spawning by phase ──
    // Bifins: kick-kick-glide pairs. Monofin: single, slower, stronger strokes.
    if (this.phase !== 'freefall') {
      if (time >= this.nextCueAt) {
        this.spawnCue('kick');
        if (this.fins === 'bi' && !this.pairPhase) {
          this.nextCueAt = time + Phaser.Math.Clamp(400 - this.maxDepth * 0.6, 260, 400);
        } else {
          let base = this.phase === 'ascent'
            ? Phaser.Math.Clamp(950 - this.depth * 3, 460, 950)
            : Phaser.Math.Clamp(1250 - this.maxDepth * 7, 560, 1250);
          if (this.fins === 'mono') base *= 0.82; // singles come a bit steadier
          const jitter = this.maxDepth > 45 ? Phaser.Math.FloatBetween(0.85, 1.2) : 1;
          this.nextCueAt = time + base * jitter;
        }
        this.pairPhase = !this.pairPhase;
      }
    } else if (time >= this.nextCueAt) {
      // Freefall: rare posture checks — stay long, stay quiet
      this.spawnCue('posture');
      this.nextCueAt = time + Phaser.Math.Between(2400, 3800);
    }

    // Contractions: below 40% O2 the body starts demanding a breath
    if (this.o2 < 40 && time >= this.nextUrgeAt) {
      if (this.nextUrgeAt > 0) this.spawnCue('urge');
      this.nextUrgeAt = time + Phaser.Math.Between(5500, 8500);
    }

    this.cueSpeed = 240 + Math.min(this.maxDepth, 200) * 2;

    // ── Move cues; what happens when one slips past depends on its type ──
    for (const c of this.cues) {
      if (!c.img.active) continue;
      c.img.y += this.cueSpeed * dt;
      if (!c.judged && c.img.y > HIT_Y + (GOOD_MS / 1000) * this.cueSpeed + 8) {
        c.judged = true;
        if (c.type === 'urge') {
          this.popup('urge resisted ✓', '#4be3a0');
          this.killCue(c, 0x4be3a0);
        } else if (c.type === 'posture') {
          this.o2 = Math.max(0, this.o2 - O2_POSTURE_MISS);
          this.postureMult = 0.7;
          this.postureUntil = time + 3000;
          this.popup('posture broken', '#ffd166');
          this.killCue(c, 0xffd166);
        } else {
          this.o2 = Math.max(0, this.o2 - O2_MISS);
          this.breakFlow();
          this.popup('missed', '#ff5d5d');
          this.killCue(c, 0xff5d5d);
          diveAudio.thud();
        }
      }
    }
    this.cues = this.cues.filter(c => c.img.active);

    // ── Phase transitions & physics ──
    if (time > this.postureUntil) this.postureMult = 1;

    if (this.phase === 'kick' && this.depth >= FREEFALL_AT) {
      this.phase = 'freefall';
      this.vel = 0;
      this.flashBanner('FREEFALL 🪶\nstop kicking — the ocean\ntakes you down for free', 1800);
      this.phaseText.setText('▼ freefall').setColor('#9fd0e8');
      this.cues.forEach(c => { if (!c.judged && c.type === 'kick') { c.judged = true; this.killCue(c, 0x557388); } });
    }

    if (this.phase === 'kick') {
      this.vel *= Math.exp(-1.3 * dt);
      this.depth += this.vel * dt;
    } else if (this.phase === 'freefall') {
      const sink = Math.min(3.4, 1.0 + (this.depth - FREEFALL_AT) * 0.022) * this.postureMult;
      this.depth += sink * dt;
    } else {
      this.vel *= Math.exp(-1.3 * dt);
      const buoy = this.depth < 12 ? 0.8 : 0;
      this.depth = Math.max(0, this.depth - (this.vel + buoy) * dt);
    }
    this.maxDepth = Math.max(this.maxDepth, this.depth);
    this.diver.y = SURFACE_Y + 20 + this.depth * PX_PER_M;

    // ── O₂: each phase has its own price; flow is efficiency ──
    let drain: number;
    if (this.phase === 'kick') drain = (DRAIN_KICK + this.depth / 200) * (this.flowActive ? 0.8 : 1);
    else if (this.phase === 'freefall') drain = DRAIN_FREEFALL;
    else drain = (DRAIN_ASCENT + this.depth / 400) * (this.flowActive ? 0.65 : 1);
    this.o2 -= drain * dt;
    if (this.o2 <= 0) return this.blackout();

    // ── The calculation: warn once when the margin gets thin ──
    const cost = this.estimatedCost();
    if (this.phase !== 'ascent' && !this.turnWarned && this.o2 < cost + 12) {
      this.turnWarned = true;
      this.flashBanner('⚠ the swim home\nis getting expensive', 1300);
      this.tweens.add({ targets: this.turnBtn, scale: 1.3, duration: 250, yoyo: true, repeat: 3 });
    }

    // ── Milestones (descent only) ──
    for (const ms of MILESTONES) {
      if (this.phase !== 'ascent' && this.depth > ms.m && !this.milestonesSeen.includes(ms.m)) {
        this.milestonesSeen.push(ms.m);
        this.popup(`−${ms.m} m · ${ms.title}`, '#ffd166');
        diveAudio.deepTone();
      }
    }
    const nx = this.nextMilestone();
    this.nextMsText.setText(nx ? `next: −${nx.m} m "${nx.title}"` : '');

    // ── Zones ──
    if (this.phase !== 'ascent') {
      for (const z of ZONES) {
        if (this.depth > z.m && !this.zonesSeen.includes(z.m)) {
          this.zonesSeen.push(z.m);
          this.flashBanner(`— ${z.m} m —\n${z.label}`, 1600);
          this.cameras.main.flash(400, 20, 40, 80, false);
          diveAudio.deepTone();
        }
      }
    }

    // ── Record chase ──
    const rec = getRecord('freedive');
    if (this.phase !== 'ascent' && !this.passedRecord && rec.depth > 0 && this.depth > rec.depth) {
      this.passedRecord = true;
      this.popup('🏆 NEW TERRITORY', '#ffd166');
      this.cameras.main.flash(300, 255, 209, 102, false);
    }

    // ── Surfaced? Then the dive isn't over: surface protocol ──
    if (this.phase === 'ascent' && this.depth <= 0.05 && this.maxDepth >= 3) return this.startProtocol();

    // ── Soundscape: muffling with depth, heartbeat on the dive reflex ──
    diveAudio.setDepth(this.depth);
    let bpm = 62;
    if (this.depth > 2) bpm = 55 - Math.min(this.depth, 60) * 0.25; // bradycardia
    if (this.flowActive) bpm -= 6; // stillness
    if (this.o2 < 30) bpm = 68 + (30 - this.o2) * 1.4; // the body protests
    diveAudio.setHeart(bpm, this.o2 < 30 ? 1 : 0.45);

    // ── HUD / lighting ──
    if (this.stillRing) this.stillRing.setPosition(this.diver.x, this.diver.y);
    updateLighting(this.lighting, this.depth, this.diver.x, this.diver.y);
    const frac = this.o2 / O2_MAX;
    this.o2Fill.width = 196 * frac;
    this.o2Fill.fillColor = frac > 0.5 ? 0x4be3a0 : frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.costMarker.setX(26 + 196 * (cost / 100));
    this.costMarker.setFillStyle(this.o2 < cost ? 0xff5d5d : 0xffffff, 0.95);
    this.dangerV.setAlpha(frac < 0.22 ? (0.22 - frac) * 1.6 + Math.sin(time / 150) * 0.05 : 0);
    this.depthText.setText(`${this.depth.toFixed(0)} m`);
    this.comboText.setText(this.combo >= 3 ? `combo ×${this.combo}` : '');
  }

  private startProtocol(): void {
    // Real competition rules: surface, recovery breaths, OK sign — or red card.
    this.state = 'protocol';
    this.dangerV.setAlpha(0);
    this.protocolTaps = 3;
    this.protocolDeadline = this.time.now + 6000;
    this.turnBtn.setVisible(false);
    this.banner.setText('SURFACE PROTOCOL').setAlpha(1).setScale(1);
    this.protocolText = this.add.text(W / 2, 380, 'recovery breaths\nTAP × 3', {
      fontFamily: 'monospace', fontSize: '26px', color: '#e8f4ff', align: 'center',
      stroke: '#02121f', strokeThickness: 5, lineSpacing: 8, padding: { y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.tweens.add({ targets: this.protocolText, scale: 1.08, duration: 450, yoyo: true, repeat: -1 });
    this.time.delayedCall(6000, () => {
      if (this.state === 'protocol') this.finishDive(false);
    });
  }

  private protocolTap(): void {
    if (this.time.now > this.protocolDeadline) return;
    this.protocolTaps--;
    diveAudio.kick(true);
    this.protocolText?.setText(this.protocolTaps > 0 ? `recovery breaths\nTAP × ${this.protocolTaps}` : '');
    if (this.protocolTaps <= 0) this.finishDive(true);
  }

  private finishDive(whiteCard: boolean): void {
    this.state = 'done';
    this.protocolText?.destroy();
    const depth = Math.floor(this.maxDepth);
    if (!whiteCard) {
      diveAudio.thud();
      this.showEnd(
        `RED CARD ✋\n\nYou touched −${depth} m but\nfailed the surface protocol.\nThe dive is not valid.`,
        'DIVE AGAIN',
      );
      return;
    }
    diveAudio.chime();
    const isRecord = submitRecord('freedive', depth);
    const rec = getRecord('freedive');
    const title = titleFor(depth);
    this.showEnd(
      isRecord
        ? `WHITE CARD ✓\nNEW RECORD! 🏆\n−${depth} m — ${rec.name}\n"${title}"`
        : `WHITE CARD ✓\n−${depth} m · "${title}"\n\n🏆 ${rec.depth} m · ${rec.name}`,
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
