import Phaser from 'phaser';
import MainScene from './scenes/MainScene/MainScene';
import PastureScene from './scenes/PastureScene/PastureScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 800,
  height: 600,
  backgroundColor: '#0f3460',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false,
    },
  },
  // The first scene in the list is the one that starts automatically.
  scene: [MainScene, PastureScene],
};

export default new Phaser.Game(config);
