import Phaser from 'phaser';

// Renders the Sprite Fusion map from public/assets/map.
// Left/right arrows run the player; the camera follows.
// Layers marked with the `collider: true`
// property in Tiled are collected in `collisionLayers`, ready to be
// used with this.physics.add.collider(player, layer) later.
export default class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private collisionLayers: (Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer)[] = [];
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

  // On-screen character height in px (2 tiles). The idle and walk sheets have
  // different frame resolutions (303x512 vs 170x238), so scale is derived per
  // animation to keep the character the same size when switching between them.
  private static readonly PLAYER_DISPLAY_HEIGHT = 128;

  constructor() {
    super('MainScene');
  }

  public preload() {
    this.load.tilemapTiledJSON('map', 'assets/map/map.json');
    this.load.image('tiles', 'assets/map/spritesheet.png');

    // idle.png: 910x1024, 3 columns x 2 rows. walk.png: 1024x238, 6 in a row.
    // The sheets don't divide perfectly (910/3, 1024/6), so the last pixel
    // column of each frame is dropped — invisible at play scale.
    this.load.spritesheet('player-idle', 'assets/sprites/player-2/idle.png', {
      frameWidth: 303,
      frameHeight: 512,
    });
    this.load.spritesheet('player-walk', 'assets/sprites/player-2/walk.png', {
      frameWidth: 170,
      frameHeight: 238,
    });
  }

  public create() {
    const map = this.make.tilemap({ key: 'map' });
    const tileset = map.addTilesetImage('spritefusion', 'tiles');
    if (!tileset) throw new Error('Tileset "spritefusion" not found in map.json');

    for (const layerData of map.layers) {
      const layer = map.createLayer(layerData.name, tileset);
      if (!layer) continue;

      const props = layerData.properties as { name: string; value: unknown }[];
      const isCollider = props?.some((p) => p.name === 'collider' && p.value === true);
      if (isCollider) {
        layer.setCollisionByExclusion([-1]);
        this.collisionLayers.push(layer);
      }
    }

    this.anims.create({
      key: 'idle',
      frames: this.anims.generateFrameNumbers('player-idle'),
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('player-walk'),
      frameRate: 10,
      repeat: -1,
    });

    this.player = this.physics.add.sprite(map.widthInPixels / 2, map.heightInPixels / 2, 'player-idle', 0);
    this.player.setCollideWorldBounds(true);
    this.player.on(
      Phaser.Animations.Events.ANIMATION_START,
      (anim: Phaser.Animations.Animation) => {
        this.player.setScale(MainScene.PLAYER_DISPLAY_HEIGHT / anim.frames[0].frame.height);
      },
    );
    this.player.play('idle');

    for (const layer of this.collisionLayers) {
      this.physics.add.collider(this.player, layer);
    }

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true);
    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  public update() {
    const speed = 250;

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
      this.player.play('walk', true);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
      this.player.play('walk', true);
    } else {
      this.player.setVelocityX(0);
      this.player.play('idle', true);
    }
  }
}
