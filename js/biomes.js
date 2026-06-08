/** Biome definitions — 22 biomes */
export const BIOMES = {
  DEEP_OCEAN:    { id: 0,  name: 'Deep Ocean',       water: true,  walkable: false, baseMoveCost: 2,   forage: 0, danger: 0.1, buildable: false },
  SHALLOW_SEA:   { id: 1,  name: 'Shallow Sea',    water: true,  walkable: false, baseMoveCost: 1.5, forage: 0.2, danger: 0.05, buildable: false },
  BEACH:         { id: 2,  name: 'Beach',            water: false, walkable: true,  baseMoveCost: 1.2, forage: 0.1, danger: 0.02, buildable: true },
  RIVER:         { id: 3,  name: 'River',            water: true,  walkable: false, baseMoveCost: 1.5, forage: 0.3, danger: 0.05, buildable: false },
  MARSH:         { id: 4,  name: 'Marsh',            water: false, walkable: true,  baseMoveCost: 2,   forage: 0.4, danger: 0.1, buildable: true },
  GRASSLAND:     { id: 5,  name: 'Grassland',        water: false, walkable: true,  baseMoveCost: 1,   forage: 0.5, danger: 0.05, buildable: true },
  SAVANNA:       { id: 6,  name: 'Savanna',          water: false, walkable: true,  baseMoveCost: 1,   forage: 0.4, danger: 0.15, buildable: true },
  FOREST:        { id: 7,  name: 'Forest',           water: false, walkable: true,  baseMoveCost: 1.3, forage: 0.7, danger: 0.1, buildable: true },
  DENSE_FOREST:  { id: 8,  name: 'Dense Forest',     water: false, walkable: true,  baseMoveCost: 1.8, forage: 0.8, danger: 0.2, buildable: true },
  TAIGA:         { id: 9,  name: 'Taiga',            water: false, walkable: true,  baseMoveCost: 1.4, forage: 0.5, danger: 0.15, buildable: true },
  TUNDRA:        { id: 10, name: 'Tundra',           water: false, walkable: true,  baseMoveCost: 1.2, forage: 0.2, danger: 0.1, buildable: true },
  SNOW:          { id: 11, name: 'Snow',             water: false, walkable: true,  baseMoveCost: 1.5, forage: 0.1, danger: 0.15, buildable: true },
  DESERT:        { id: 12, name: 'Desert',           water: false, walkable: true,  baseMoveCost: 1.3, forage: 0.1, danger: 0.2, buildable: true },
  DUNES:         { id: 13, name: 'Dunes',            water: false, walkable: true,  baseMoveCost: 1.6, forage: 0.05, danger: 0.15, buildable: true },
  BADLANDS:      { id: 14, name: 'Badlands',         water: false, walkable: true,  baseMoveCost: 1.4, forage: 0.15, danger: 0.25, buildable: true },
  VOLCANIC:      { id: 15, name: 'Volcanic',         water: false, walkable: true,  baseMoveCost: 1.5, forage: 0.05, danger: 0.5, buildable: true },
  HIGHLANDS:     { id: 16, name: 'Highlands',        water: false, walkable: true,  baseMoveCost: 1.2, forage: 0.4, danger: 0.1, buildable: true },
  MEADOW:        { id: 17, name: 'Meadow',           water: false, walkable: true,  baseMoveCost: 1,   forage: 0.6, danger: 0.03, buildable: true },
  SWAMP:         { id: 18, name: 'Swamp',            water: false, walkable: true,  baseMoveCost: 2.2, forage: 0.5, danger: 0.2, buildable: true },
  JUNGLE:        { id: 19, name: 'Jungle',           water: false, walkable: true,  baseMoveCost: 2,   forage: 0.9, danger: 0.3, buildable: true },
  CRYSTAL_CAVERN:{ id: 20, name: 'Crystal Cavern',   water: false, walkable: true,  baseMoveCost: 1.5, forage: 0.1, danger: 0.35, buildable: false },
  CORRUPTED:     { id: 21, name: 'Corrupted Wasteland', water: false, walkable: true, baseMoveCost: 1.4, forage: 0.05, danger: 0.6, buildable: true },
};

export const BIOME_LIST = Object.values(BIOMES);
export const BIOME_BY_ID = Object.fromEntries(BIOME_LIST.map(b => [b.id, b]));
