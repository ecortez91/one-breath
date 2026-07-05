import Phaser from 'phaser';
import './style.css';
import { MenuScene } from './scenes/MenuScene';
import { FreediveScene } from './scenes/FreediveScene';
import { CaveScene } from './scenes/CaveScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 480,
  height: 800,
  backgroundColor: '#02121f',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MenuScene, FreediveScene, CaveScene],
});

// Exposed for debugging and automated playtesting
(window as unknown as { game: Phaser.Game }).game = game;
