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
  private enemy!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
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
  // Enemy TorcherMini: stands idle until the player comes within the aggro
  // radius, chases at a bit less than player speed, swings its torch when
  // in reach. Also 192x192, but the goblin's body sits a little differently
  // in the frame than the Pawn's, hence its own body box.
  private static readonly ENEMY_BODY = { width: 56, height: 60, offsetX: 68, offsetY: 74 };
  private static readonly ENEMY_SPEED = 160;
  private static readonly ENEMY_AGGRO_RADIUS = 280;
  private static readonly ENEMY_ATTACK_RANGE = 75;
  // Render order: water background at the bottom, foam above it, then the
  // terrain layers (default depth 0) and finally the characters.
  private static readonly WATER_DEPTH = -10;
  private static readonly FOAM_DEPTH = -5;
  // Each tree in the map is a 3x3 tile block; the block's centre tile index
  // identifies the tree so it can be swapped for an animated sprite.
  // (tile index = tileset index + 1, because the tileset's firstgid is 1)
  private static readonly TREE_CENTER_TILES: Record<number, string> = {
    36: 'tree-sway-a', 54: 'tree-sway-a', 110: 'tree-sway-a',
    42: 'tree-sway-b', 49: 'tree-sway-b', 117: 'tree-sway-b',
  };

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

    // Enemy: Tiny Swords TorcherMini (idle 7, walk 6, attack 6 frames).
    // The pack ships idle/walk/attack combined in one sheet (Torch_Red.png,
    // a 7x5 grid of 192x192 frames with some unused padding cells); each of
    // these three files is a single animation row cropped out of it ahead
    // of time, so preload can treat them as ordinary spritesheets.
    this.load.spritesheet('enemy-idle', 'assets/tiny-swords/torchermini-idle.png', {
      frameWidth: MainScene.PAWN_FRAME_SIZE,
      frameHeight: MainScene.PAWN_FRAME_SIZE,
    });
    this.load.spritesheet('enemy-walk', 'assets/tiny-swords/torchermini-walk.png', {
      frameWidth: MainScene.PAWN_FRAME_SIZE,
      frameHeight: MainScene.PAWN_FRAME_SIZE,
    });
    this.load.spritesheet('enemy-attack', 'assets/tiny-swords/torchermini-attack.png', {
      frameWidth: MainScene.PAWN_FRAME_SIZE,
      frameHeight: MainScene.PAWN_FRAME_SIZE,
    });

    // Wind-swaying trees (8 frames each) and shoreline foam (16 frames).
    // The tileset bakes tree frame 0 into the map; create() swaps those
    // tiles for these animated sprites.
    this.load.spritesheet('tree-a', 'assets/tiny-swords/tree-a.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet('tree-b', 'assets/tiny-swords/tree-b.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet('water-foam', 'assets/tiny-swords/water-foam.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
  }

  public create() {
    const map = this.make.tilemap({ key: 'map' });
    const tileset = map.addTilesetImage('spritefusion', 'tiles');
    if (!tileset) throw new Error('Tileset "spritefusion" not found in map.json');

    for (const layerData of map.layers) {
      const layer = map.createLayer(layerData.name, tileset);
      if (!layer) continue;

      if (layerData.name === 'Background') layer.setDepth(MainScene.WATER_DEPTH);

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
    this.anims.create({
      key: 'enemy-idle',
      frames: this.anims.generateFrameNumbers('enemy-idle'),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'enemy-walk',
      frames: this.anims.generateFrameNumbers('enemy-walk'),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'enemy-attack',
      frames: this.anims.generateFrameNumbers('enemy-attack'),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'tree-sway-a',
      frames: this.anims.generateFrameNumbers('tree-a'),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'tree-sway-b',
      frames: this.anims.generateFrameNumbers('tree-b'),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'water-foam',
      frames: this.anims.generateFrameNumbers('water-foam'),
      frameRate: 10,
      repeat: -1,
    });

    this.setupWaterFoam(map);
    this.setupTreeSprites(map);

    this.player = this.physics.add.sprite(map.widthInPixels / 2, map.heightInPixels / 2, 'player-idle', 0);
    this.player.setCollideWorldBounds(true);
    // Shrink the physics body from the padded 192x192 frame to the character.
    const body = MainScene.PAWN_BODY;
    this.player.body.setSize(body.width, body.height);
    this.player.body.setOffset(body.offsetX, body.offsetY);
    this.player.play('idle');

    // The enemy starts a few tiles right of the player's spawn.
    this.enemy = this.physics.add.sprite(map.widthInPixels / 2 + 320, map.heightInPixels / 2 - 64, 'enemy-idle', 0);
    this.enemy.setCollideWorldBounds(true);
    const enemyBody = MainScene.ENEMY_BODY;
    this.enemy.body.setSize(enemyBody.width, enemyBody.height);
    this.enemy.body.setOffset(enemyBody.offsetX, enemyBody.offsetY);
    this.enemy.play('enemy-idle');

    for (const layer of this.collisionLayers) {
      this.physics.add.collider(this.player, layer);
      this.physics.add.collider(this.enemy, layer);
    }
    this.physics.add.collider(this.player, this.enemy);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
  }

  public update() {
    this.updateEnemy();

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

  // Tiles can't animate, so each tree's 3x3 tile block is removed and an
  // animated sway sprite is dropped in its exact place (frame 0 matches the
  // tiles that were there). Random start frames de-synchronise the trees.
  private setupTreeSprites(map: Phaser.Tilemaps.Tilemap) {
    for (const layerName of ['Trees back', 'Trees front']) {
      const centers: { tx: number; ty: number; anim: string }[] = [];
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const tile = map.getTileAt(tx, ty, false, layerName);
          const anim = tile ? MainScene.TREE_CENTER_TILES[tile.index] : undefined;
          if (anim) centers.push({ tx, ty, anim });
        }
      }
      for (const { tx, ty, anim } of centers) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            map.removeTileAt(tx + dx, ty + dy, true, false, layerName);
          }
        }
        this.add
          .sprite(
            (tx + 0.5) * map.tileWidth,
            (ty + 0.5) * map.tileHeight,
            anim === 'tree-sway-a' ? 'tree-a' : 'tree-b',
            0,
          )
          .play({ key: anim, startFrame: Phaser.Math.Between(0, 7) });
      }
    }
  }

  // Puts a looping foam sprite under every grass/sand tile that borders
  // visible water, between the water background and the terrain layers.
  private setupWaterFoam(map: Phaser.Tilemaps.Tilemap) {
    const shoreLayers = ['Grass', 'Sand'];
    const groundLayers = [
      ...shoreLayers,
      'Cliff',
      'Rocks',
      'Stairs',
      'Bridge - vertical',
      'Bridge - horizontal',
    ];
    const isWater = (tx: number, ty: number) =>
      tx >= 0 && ty >= 0 && tx < map.width && ty < map.height &&
      !groundLayers.some((name) => map.hasTileAt(tx, ty, name));

    const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!shoreLayers.some((name) => map.hasTileAt(tx, ty, name))) continue;
        if (!neighbours.some(([dx, dy]) => isWater(tx + dx, ty + dy))) continue;
        this.add
          .sprite((tx + 0.5) * map.tileWidth, (ty + 0.5) * map.tileHeight, 'water-foam', 0)
          .setDepth(MainScene.FOAM_DEPTH)
          .play('water-foam');
      }
    }
  }

  // Idle until the player is close, chase while they're in aggro range,
  // swing the torch once they're within reach.
  private updateEnemy() {
    const distance = Phaser.Math.Distance.Between(
      this.enemy.x, this.enemy.y,
      this.player.x, this.player.y,
    );

    if (distance <= MainScene.ENEMY_ATTACK_RANGE) {
      this.enemy.setVelocity(0, 0);
      this.enemy.setFlipX(this.player.x < this.enemy.x);
      this.enemy.play('enemy-attack', true);
      return;
    }

    if (distance <= MainScene.ENEMY_AGGRO_RADIUS) {
      const chase = new Phaser.Math.Vector2(
        this.player.x - this.enemy.x,
        this.player.y - this.enemy.y,
      ).normalize().scale(MainScene.ENEMY_SPEED);
      this.enemy.setVelocity(chase.x, chase.y);
      this.enemy.setFlipX(chase.x < 0);
      this.enemy.play('enemy-walk', true);
      return;
    }

    this.enemy.setVelocity(0, 0);
    this.enemy.play('enemy-idle', true);
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
