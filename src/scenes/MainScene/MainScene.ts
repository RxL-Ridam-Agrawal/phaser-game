import Phaser from 'phaser';

// Renders the Sprite Fusion map from public/assets/map. The tileset image
// (spritesheet.png) is composed from Tiny Swords (Free Pack) art, so the
// map keeps its original layout but wears the Tiny Swords look.
//
// Controls: arrow keys move in all four directions (top-down), SPACE hops,
// X swings the axe. Layers marked with the `collider: true` property are
// solid.
export default class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private collisionLayers: (Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer)[] = [];
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private isAttacking = false;
  private isJumping = false;

  // Pawn frames are 192x192 with large transparent padding; the character
  // itself is ~50x70 px around the frame centre (feet at y~134). Drawn at
  // native scale to match the Tiny Swords map art.
  private static readonly PAWN_FRAME_SIZE = 192;
  private static readonly PAWN_BODY = { width: 48, height: 64, offsetX: 72, offsetY: 70 };
  private static readonly SPEED = 250;
  // The map is top-down, so a jump is a visual hop: the sprite art rises
  // and lands while the physics body stays on the ground.
  private static readonly JUMP_HEIGHT = 40;
  private static readonly JUMP_RISE_MS = 170;

  constructor() {
    super('MainScene');
  }

  public preload() {
    this.load.tilemapTiledJSON('map', 'assets/map/map.json');
    this.load.image('tiles', 'assets/map/spritesheet.png');

    // Tiny Swords Pawn: idle has 8 frames, run has 6, all 192x192.
    this.load.spritesheet('player-idle', 'assets/tiny-swords/pawn-idle.png', {
      frameWidth: MainScene.PAWN_FRAME_SIZE,
      frameHeight: MainScene.PAWN_FRAME_SIZE,
    });
    this.load.spritesheet('player-walk', 'assets/tiny-swords/pawn-run.png', {
      frameWidth: MainScene.PAWN_FRAME_SIZE,
      frameHeight: MainScene.PAWN_FRAME_SIZE,
    });
    this.load.spritesheet('player-attack', 'assets/tiny-swords/pawn-attack.png', {
      frameWidth: MainScene.PAWN_FRAME_SIZE,
      frameHeight: MainScene.PAWN_FRAME_SIZE,
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
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('player-walk'),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'attack',
      frames: this.anims.generateFrameNumbers('player-attack'),
      frameRate: 14,
      repeat: 0,
    });

    this.player = this.physics.add.sprite(map.widthInPixels / 2, map.heightInPixels / 2, 'player-idle', 0);
    this.player.setCollideWorldBounds(true);
    // Shrink the physics body from the padded 192x192 frame to the character.
    const body = MainScene.PAWN_BODY;
    this.player.body.setSize(body.width, body.height);
    this.player.body.setOffset(body.offsetX, body.offsetY);
    this.player.play('idle');

    for (const layer of this.collisionLayers) {
      this.physics.add.collider(this.player, layer);
    }

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
  }

  public update() {
    // The axe swing commits the player: no moving until it finishes.
    if (this.isAttacking) return;

    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.attack();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
      this.jump();
    }

    // Four-directional movement, normalised so diagonals aren't faster.
    const move = new Phaser.Math.Vector2(
      Number(this.cursors.right.isDown) - Number(this.cursors.left.isDown),
      Number(this.cursors.down.isDown) - Number(this.cursors.up.isDown),
    );
    move.normalize().scale(MainScene.SPEED);
    this.player.setVelocity(move.x, move.y);

    if (move.x < 0) this.player.setFlipX(true);
    else if (move.x > 0) this.player.setFlipX(false);

    this.player.play(move.length() > 0 ? 'walk' : 'idle', true);
  }

  private attack() {
    this.isAttacking = true;
    this.player.setVelocity(0, 0);
    this.player.play('attack');
    this.player.once(
      Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'attack',
      () => {
        this.isAttacking = false;
        this.player.play('idle');
      },
    );
  }

  private jump() {
    if (this.isJumping) return;
    this.isJumping = true;
    // Raising displayOriginY draws the texture higher while the physics
    // body (and the player's map position) stays on the ground.
    this.tweens.add({
      targets: this.player,
      displayOriginY: this.player.displayOriginY + MainScene.JUMP_HEIGHT,
      duration: MainScene.JUMP_RISE_MS,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        this.isJumping = false;
      },
    });
  }
}
