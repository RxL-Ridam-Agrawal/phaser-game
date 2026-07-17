import Phaser from 'phaser';
import { buildIslandMapData, TILE_SIZE, type IslandSpec } from '../../maps/tinySwordsIsland';

// A small grass island with a sheep that alternates between standing idle
// and grazing. The island tile data is built in code — see
// src/maps/tinySwordsIsland.ts for how the tileset is laid out.
export default class PastureScene extends Phaser.Scene {
  private sheep!: Phaser.GameObjects.Sprite;

  // Map size in tiles, with the island rectangle inside it.
  private static readonly MAP: IslandSpec = {
    cols: 13,
    rows: 10,
    island: { left: 2, right: 10, top: 2, bottom: 7 },
  };

  // Sheep sheets: 128x128 frames — idle has 6, grazing has 12.
  private static readonly SHEEP_FRAME_SIZE = 128;

  constructor() {
    super('PastureScene');
  }

  public preload() {
    this.load.image('water', 'assets/tiny-swords/water.png');
    this.load.image('island-tiles', 'assets/tiny-swords/tilemap.png');
    this.load.spritesheet('sheep-idle', 'assets/tiny-swords/sheep-idle.png', {
      frameWidth: PastureScene.SHEEP_FRAME_SIZE,
      frameHeight: PastureScene.SHEEP_FRAME_SIZE,
    });
    this.load.spritesheet('sheep-graze', 'assets/tiny-swords/sheep-graze.png', {
      frameWidth: PastureScene.SHEEP_FRAME_SIZE,
      frameHeight: PastureScene.SHEEP_FRAME_SIZE,
    });
  }

  public create() {
    const map = this.make.tilemap({
      data: buildIslandMapData(PastureScene.MAP),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    // Flat water colour tiled across the whole map, underneath the island.
    this.add.tileSprite(0, 0, map.widthInPixels, map.heightInPixels, 'water').setOrigin(0);

    const tileset = map.addTilesetImage('island-tiles');
    if (!tileset) throw new Error('Tileset image "island-tiles" not found');
    map.createLayer(0, tileset);

    this.anims.create({
      key: 'sheep-idle',
      frames: this.anims.generateFrameNumbers('sheep-idle'),
      frameRate: 7,
      repeat: -1,
    });
    this.anims.create({
      key: 'sheep-graze',
      frames: this.anims.generateFrameNumbers('sheep-graze'),
      frameRate: 8,
      repeat: -1,
    });

    this.sheep = this.add.sprite(map.widthInPixels / 2, map.heightInPixels / 2, 'sheep-idle', 0);
    this.sheep.play('sheep-idle');
    this.scheduleAnimationSwap();

    this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
  }

  // Let the current animation run for a few seconds, then switch between
  // idle and grazing, forever.
  private scheduleAnimationSwap() {
    this.time.delayedCall(Phaser.Math.Between(2500, 5000), () => {
      const grazing = this.sheep.anims.getName() === 'sheep-graze';
      this.sheep.play(grazing ? 'sheep-idle' : 'sheep-graze');
      this.scheduleAnimationSwap();
    });
  }

}
