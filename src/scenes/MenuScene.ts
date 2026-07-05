import Phaser from 'phaser';
import { makeTextures } from './textures';
import { getBest } from './records';

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

    this.add.text(width / 2, 190, '🤿', { fontSize: '84px' }).setOrigin(0.5);

    this.add.text(width / 2, 290, 'ONE BREATH', {
      fontFamily: 'Georgia, serif',
      fontSize: '52px',
      color: '#e8f4ff',
      letterSpacing: 6,
    }).setOrigin(0.5);

    this.add.text(width / 2, 340, 'a freediving game', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      fontStyle: 'italic',
      color: '#8fc8e8',
    }).setOrigin(0.5);

    const best = getBest();
    if (best > 0) {
      this.add.text(width / 2, 410, `Personal best: ${best} m`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffd166',
      }).setOrigin(0.5);
    }

    this.add.text(width / 2, 500,
      'Hold to swim toward your finger\n(or use the arrow keys)\n\nGrab air bubbles · Avoid jellyfish\nSurface before your O₂ runs out!', {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      color: '#bcd9ea',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    const start = this.add.text(width / 2, 640, 'TAP TO DIVE', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#e8f4ff',
      backgroundColor: '#0d5c8c',
      padding: { x: 26, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: start,
      alpha: 0.6,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.add.text(width / 2, height - 26, 'by Eduardo Cortez · open water is calling', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#5a8ba8',
    }).setOrigin(0.5);

    const go = () => this.scene.start('dive');
    start.on('pointerdown', go);
    this.input.keyboard?.once('keydown-SPACE', go);
    this.input.keyboard?.once('keydown-ENTER', go);
  }
}
