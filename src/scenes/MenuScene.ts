import Phaser from 'phaser';
import { makeTextures } from './textures';
import { getRecord } from './records';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    makeTextures(this);
    const { width, height } = this.scale;

    // Ocean gradient background
    const bands = 8;
    for (let i = 0; i < bands; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x0d5c8c),
        Phaser.Display.Color.ValueToColor(0x02121f),
        bands - 1,
        i,
      );
      this.add
        .rectangle(width / 2, (i + 0.5) * (height / bands), width, height / bands + 1,
          Phaser.Display.Color.GetColor(c.r, c.g, c.b))
        .setDepth(0);
    }

    // Rising bubbles
    for (let i = 0; i < 18; i++) {
      const b = this.add.image(Phaser.Math.Between(20, width - 20), Phaser.Math.Between(0, height), 'bubble')
        .setScale(Phaser.Math.FloatBetween(0.3, 0.9))
        .setAlpha(Phaser.Math.FloatBetween(0.2, 0.6));
      this.tweens.add({
        targets: b,
        y: -20,
        duration: Phaser.Math.Between(6000, 14000),
        repeat: -1,
        onRepeat: () => {
          b.y = height + 20;
          b.x = Phaser.Math.Between(20, width - 20);
        },
      });
    }

    this.add.text(width / 2, 110, '🤿', { fontSize: '64px' }).setOrigin(0.5);
    this.add.text(width / 2, 185, 'ONE BREATH', {
      fontFamily: 'Georgia, serif', fontSize: '46px', color: '#e8f4ff', letterSpacing: 6,
    }).setOrigin(0.5);
    this.add.text(width / 2, 228, 'two ways down', {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'italic', color: '#8fc8e8',
    }).setOrigin(0.5);

    this.modeCard(
      310,
      '🌬 FREEDIVE',
      'Pure technique. Kick in rhythm,\ntighter timing the deeper you go.\nTurn back before it is too late.',
      'freedive',
      '#4be3a0',
    );

    this.modeCard(
      520,
      '🛢 CAVE DIVE',
      'Explore the deep. Find gas tanks,\ndodge jellyfish, swim home.',
      'cave',
      '#ffd166',
    );

    this.add.text(width / 2, height - 60, 'Depth only counts if you surface.', {
      fontFamily: 'Georgia, serif', fontSize: '15px', fontStyle: 'italic', color: '#5a8ba8',
    }).setOrigin(0.5);
    this.add.text(width / 2, height - 26, 'by Eduardo Cortez · open water is calling', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#5a8ba8',
    }).setOrigin(0.5);

    this.input.keyboard?.on('keydown-ONE', () => this.scene.start('freedive'));
    this.input.keyboard?.on('keydown-TWO', () => this.scene.start('cave'));
  }

  private modeCard(y: number, title: string, desc: string, key: string, accent: string): void {
    const { width } = this.scale;
    const card = this.add.rectangle(width / 2, y, width - 60, 168, 0x02121f, 0.55)
      .setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(accent).color, 0.5)
      .setInteractive({ useHandCursor: true });

    this.add.text(width / 2, y - 52, title, {
      fontFamily: 'monospace', fontSize: '26px', color: accent,
    }).setOrigin(0.5);

    this.add.text(width / 2, y - 2, desc, {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#bcd9ea', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5);

    const rec = getRecord(key as 'freedive' | 'cave');
    this.add.text(width / 2, y + 52,
      rec.depth > 0 ? `🏆 ${rec.depth} m · ${rec.name}` : 'no record yet — set one!', {
      fontFamily: 'monospace', fontSize: '15px', color: rec.depth > 0 ? '#ffd166' : '#5a8ba8',
    }).setOrigin(0.5);

    card.on('pointerdown', () => this.scene.start(key));
    this.tweens.add({
      targets: card, alpha: 0.85, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }
}
