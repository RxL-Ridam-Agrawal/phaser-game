// Builds tile data for a rectangular grass island from the Tiny Swords
// tileset (public/assets/tiny-swords/tilemap.png).
//
// The tileset image is a 9-column grid of 64x64 tiles (index = row * 9 + col).
// Its top-left 3x3 block is a complete grass island "autotile":
//
//    0  1  2      top-left    | top edge    | top-right
//    9 10 11  =   left edge   | grass       | right edge
//   18 19 20      bottom-left | bottom edge | bottom-right

export const TILE_SIZE = 64;
export const TILESET_COLUMNS = 9;

// -1 means "no tile" — whatever is drawn underneath (water) shows through.
export const WATER = -1;

// Every island tile except the walkable grass center (index 10). Use with
// layer.setCollision() to keep characters on the island.
export const ISLAND_BORDER_TILES = [0, 1, 2, 9, 11, 18, 19, 20];

export interface IslandSpec {
  /** Map size in tiles. */
  cols: number;
  rows: number;
  /** Island rectangle within the map, in tile coordinates (inclusive). */
  island: { left: number; right: number; top: number; bottom: number };
}

// Returns a rows x cols grid of tile indices: water everywhere, with the
// island rectangle filled from the 3x3 grass autotile.
export function buildIslandMapData(spec: IslandSpec): number[][] {
  const data: number[][] = [];
  for (let row = 0; row < spec.rows; row++) {
    const cols: number[] = [];
    for (let col = 0; col < spec.cols; col++) {
      cols.push(tileAt(spec, col, row));
    }
    data.push(cols);
  }
  return data;
}

function tileAt(spec: IslandSpec, col: number, row: number): number {
  const { left, right, top, bottom } = spec.island;
  if (col < left || col > right || row < top || row > bottom) {
    return WATER;
  }
  // Pick the autotile cell: edge tiles on the island border, grass inside.
  const blockCol = col === left ? 0 : col === right ? 2 : 1;
  const blockRow = row === top ? 0 : row === bottom ? 2 : 1;
  return blockRow * TILESET_COLUMNS + blockCol;
}
