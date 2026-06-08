import { RNG } from './rng.js';
import { generateHexGrid, hexKey, hexNeighbors } from './hex.js';
import { BIOMES } from './biomes.js';
import { getBaseHexColor } from './textures.js';

/** Integer hash → [0,1), used for coherent value noise */
function makeHash(seed) {
  return (x, y) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
}

function valueNoise(hash, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(hash, x, y, octaves = 5) {
  let v = 0, amp = 1, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(hash, x * freq, y * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / total;
}

export const WORLD_RADIUS = 84;
const SEA_LEVEL = 0.36;

export function generateWorld(seed, radius = WORLD_RADIUS) {
  const rng = new RNG(seed);
  const coords = generateHexGrid(radius);
  const hexMap = new Map();

  const hashE = makeHash(seed);
  const hashE2 = makeHash(seed + 7919);
  const hashM = makeHash(seed + 104729);
  const hashT = makeHash(seed + 1299709);
  const scale = 0.045;

  // Pass 1: raw elevation with continental falloff so oceans ring the edges
  const raw = [];
  let minE = Infinity, maxE = -Infinity;
  for (const { q, r } of coords) {
    const nx = (q + 1000) * scale;
    const ny = (r + 1000) * scale;
    // domain warp for more organic coastlines
    const wx = nx + fbm(hashE2, nx, ny, 3) * 0.6;
    const wy = ny + fbm(hashE2, nx + 50, ny + 50, 3) * 0.6;
    let e = fbm(hashE, wx, wy, 6);

    // radial continent mask (cube distance from center, normalized 0..1)
    const dist = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
    const norm = Math.min(1, dist / radius);
    const falloff = Math.pow(norm, 2.4);
    e = e * 1.15 - falloff * 1.05 + 0.18;

    raw.push({ q, r, e });
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
  }

  const span = maxE - minE || 1;
  for (const cell of raw) {
    const { q, r } = cell;
    const elevation = (cell.e - minE) / span;
    const nx = (q + 1000) * scale, ny = (r + 1000) * scale;
    const moisture = fbm(hashM, nx * 1.3 + 20, ny * 1.3 + 20, 5);
    // temperature follows latitude (warm equator, cold toward edges) minus altitude
    const lat = Math.abs(r) / radius;
    let temperature = 1 - lat * 0.95 + (fbm(hashT, nx, ny, 3) - 0.5) * 0.35 - Math.max(0, elevation - SEA_LEVEL) * 0.5;
    temperature = Math.max(0, Math.min(1, temperature));

    const biomeId = assignBiome(elevation, moisture, temperature, q, r);
    const biome = BIOMES_BY_ID(biomeId);
    const waterDepth = elevation < SEA_LEVEL ? (SEA_LEVEL - elevation) * 3 : 0;
    const walkable = biome.walkable && waterDepth < 1.2;

    const hex = {
      q, r,
      elevation,
      moisture,
      temperature,
      biomeId,
      waterDepth,
      walkable: walkable || (waterDepth > 0 && waterDepth < 0.7),
      baseMoveCost: biome.baseMoveCost,
      road: false,
      building: null,
      settlementId: null,
      dungeon: null,
      crop: null,
      wildlife: 0,
    };
    hex.baseColor = getBaseHexColor(hex);
    hexMap.set(hexKey(q, r), hex);
  }

  placeRivers(hexMap, rng);
  const settlements = placeSettlements(hexMap, rng);
  const dungeons = placeDungeons(hexMap, rng);

  // rebake colors for tiles changed by rivers
  for (const hex of hexMap.values()) {
    if (hex.biomeId === BIOMES.RIVER.id) hex.baseColor = getBaseHexColor(hex);
  }

  return { hexMap, settlements, dungeons, seed, radius };
}

function BIOMES_BY_ID(id) {
  return Object.values(BIOMES).find(b => b.id === id) || BIOMES.GRASSLAND;
}

function assignBiome(elev, moist, temp, q, r) {
  if (elev < SEA_LEVEL - 0.12) return BIOMES.DEEP_OCEAN.id;
  if (elev < SEA_LEVEL - 0.02) return BIOMES.SHALLOW_SEA.id;
  if (elev < SEA_LEVEL + 0.03) return BIOMES.BEACH.id;

  // high mountains
  if (elev > 0.86) {
    if (temp > 0.6 && moist < 0.3) return BIOMES.VOLCANIC.id;
    if (temp < 0.35) return BIOMES.SNOW.id;
    return BIOMES.HIGHLANDS.id;
  }
  if (elev > 0.74) {
    if (temp < 0.3) return BIOMES.SNOW.id;
    return BIOMES.HIGHLANDS.id;
  }

  // cold
  if (temp < 0.2) return elev > 0.5 ? BIOMES.SNOW.id : BIOMES.TUNDRA.id;
  if (temp < 0.33) return moist > 0.5 ? BIOMES.TAIGA.id : BIOMES.TUNDRA.id;

  // hot
  if (temp > 0.78) {
    if (moist < 0.22) return BIOMES.DUNES.id;
    if (moist < 0.38) return BIOMES.DESERT.id;
    if (moist > 0.7) return BIOMES.JUNGLE.id;
    if (moist > 0.5) return BIOMES.SAVANNA.id;
    return BIOMES.BADLANDS.id;
  }

  // temperate
  if (moist > 0.74) return temp > 0.55 ? BIOMES.SWAMP.id : BIOMES.MARSH.id;
  if (moist > 0.62) return BIOMES.DENSE_FOREST.id;
  if (moist > 0.5) return BIOMES.FOREST.id;
  if (moist > 0.4) return elev > 0.55 ? BIOMES.MEADOW.id : BIOMES.GRASSLAND.id;
  if (moist < 0.18 && temp > 0.55) return BIOMES.BADLANDS.id;
  return BIOMES.GRASSLAND.id;
}

function placeRivers(hexMap, rng) {
  const peaks = [...hexMap.values()].filter(h => h.elevation > 0.72 && h.elevation < 0.92);
  const sources = rng.shuffle(peaks).slice(0, 8 + rng.int(0, 6));
  for (const src of sources) {
    let current = src;
    const visited = new Set();
    for (let step = 0; step < 60; step++) {
      visited.add(hexKey(current.q, current.r));
      if (current.elevation > SEA_LEVEL && current.biomeId !== BIOMES.RIVER.id) {
        current.biomeId = BIOMES.RIVER.id;
        current.waterDepth = Math.max(current.waterDepth, 0.45);
        current.walkable = true;
        current.baseMoveCost = BIOMES.RIVER.baseMoveCost;
      }
      const neighbors = hexNeighbors(current.q, current.r)
        .map(n => hexMap.get(hexKey(n.q, n.r)))
        .filter(Boolean)
        .filter(n => !visited.has(hexKey(n.q, n.r)));
      if (!neighbors.length) break;
      neighbors.sort((a, b) => a.elevation - b.elevation);
      const next = neighbors[0];
      if (next.elevation > current.elevation) break;
      current = next;
      if (current.elevation < SEA_LEVEL) break;
    }
  }
}

function placeSettlements(hexMap, rng) {
  const candidates = [...hexMap.values()].filter(h =>
    h.walkable && h.elevation >= SEA_LEVEL + 0.04 && h.elevation < 0.72 &&
    [BIOMES.GRASSLAND.id, BIOMES.MEADOW.id, BIOMES.FOREST.id, BIOMES.SAVANNA.id].includes(h.biomeId)
  );
  const count = Math.min(38, Math.max(16, Math.floor(candidates.length * 0.005)));
  const picked = rng.shuffle(candidates).slice(0, count);
  const settlements = [];
  picked.forEach((hex, i) => {
    const id = `settlement_${i}`;
    hex.settlementId = id;
    const settlement = {
      id,
      name: generateSettlementName(rng),
      tier: i < 3 ? 'town' : i < 8 ? 'village' : 'hamlet',
      hex: { q: hex.q, r: hex.r },
      population: 0,
      treasury: 800 + rng.int(0, 1200),
      taxRate: 0.08 + rng.next() * 0.06,
      debt: 0,
      foodStore: 150 + rng.int(0, 100),
      unemployment: 0,
      buildings: [],
      jobs: startingJobs(i < 3 ? 'town' : i < 8 ? 'village' : 'hamlet'),
      prisoners: [],
      recentTrades: [],
      recentEvents: [],
      granaryCapacity: 600,
      constructionQueue: [],
      territory: [],
      rulerId: null,
      liegeId: null,
    };
    settlements.push(settlement);
    const territoryRadius = 3 + rng.int(0, 2);
    for (const tile of hexMap.values()) {
      const dist = Math.abs(tile.q - hex.q) + Math.abs(tile.r - hex.r);
      if (dist <= territoryRadius && tile.walkable && !tile.settlementId) {
        tile.settlementId = id;
        settlement.territory.push({ q: tile.q, r: tile.r });
      }
    }
  });
  return settlements;
}

function startingJobs(tier) {
  const cfg = {
    town:    { farmer: 4, fisher: 2, hunter: 2, guard: 3, watchman: 2, merchant: 2, blacksmith: 2, carpenter: 1,
               mage: 2, priest: 1, healer: 1, herbalist: 1, noble: 1, thief: 1, spy: 1, adventurer: 2,
               clerk: 1, bard: 1, brewer: 1, scholar: 1, warlord: 1, ranger: 1, innkeeper: 1, taxcollector: 1 },
    village: { farmer: 3, fisher: 2, hunter: 1, guard: 2, merchant: 1, blacksmith: 1, healer: 1,
               mage: 1, priest: 1, thief: 1, adventurer: 1, clerk: 1, brewer: 1, ranger: 1, shepherd: 1 },
    hamlet:  { farmer: 2, fisher: 1, hunter: 1, guard: 1, merchant: 1, blacksmith: 1, herbalist: 1, clerk: 1 },
  }[tier] || { farmer: 2, fisher: 1, hunter: 1, guard: 1, clerk: 1 };
  const jobs = [];
  for (const [type, slots] of Object.entries(cfg)) {
    if (slots > 0) jobs.push({ type, slots, filled: 0 });
  }
  return jobs;
}

export function addJobSlots(settlement, bType) {
  const slots = {
    farm:       [{ type: 'farmer', slots: 2, filled: 0 }, { type: 'shepherd', slots: 1, filled: 0 }],
    market:     [{ type: 'merchant', slots: 2, filled: 0 }, { type: 'taxcollector', slots: 1, filled: 0 }],
    tavern:     [{ type: 'innkeeper', slots: 1, filled: 0 }, { type: 'bard', slots: 1, filled: 0 }, { type: 'brewer', slots: 1, filled: 0 }],
    barracks:   [{ type: 'guard', slots: 3, filled: 0 }, { type: 'warlord', slots: 1, filled: 0 }, { type: 'watchman', slots: 2, filled: 0 }],
    temple:     [{ type: 'mage', slots: 1, filled: 0 }, { type: 'priest', slots: 2, filled: 0 }, { type: 'healer', slots: 1, filled: 0 }, { type: 'enchanter', slots: 1, filled: 0 }],
    prison:     [{ type: 'guard', slots: 1, filled: 0 }, { type: 'executioner', slots: 1, filled: 0 }],
    guild_hall: [{ type: 'adventurer', slots: 3, filled: 0 }, { type: 'ranger', slots: 2, filled: 0 }, { type: 'scholar', slots: 1, filled: 0 }],
    granary:    [{ type: 'baker', slots: 2, filled: 0 }, { type: 'clerk', slots: 1, filled: 0 }],
    home:       [],
  };
  if (slots[bType]) settlement.jobs.push(...slots[bType]);
}

function placeDungeons(hexMap, rng) {
  const candidates = [...hexMap.values()].filter(h =>
    h.walkable && !h.settlementId &&
    [BIOMES.FOREST.id, BIOMES.DENSE_FOREST.id, BIOMES.HIGHLANDS.id, BIOMES.CRYSTAL_CAVERN.id, BIOMES.CORRUPTED.id].includes(h.biomeId)
  );
  const count = Math.min(18, rng.int(8, 14));
  return rng.shuffle(candidates).slice(0, count).map((hex, i) => {
    hex.dungeon = { id: `dungeon_${i}`, depth: rng.int(3, 6), cleared: 0, boss: true };
    return { id: `dungeon_${i}`, hex: { q: hex.q, r: hex.r }, depth: hex.dungeon.depth };
  });
}

const PREFIXES = ['Aether', 'Silver', 'Moon', 'Star', 'Iron', 'Golden', 'Crystal', 'Shadow', 'Bright', 'Oak'];
const SUFFIXES = ['haven', 'ford', 'dale', 'burg', 'wick', 'mere', 'holm', 'reach', 'fall', 'crest'];

function generateSettlementName(rng) {
  return rng.pick(PREFIXES) + rng.pick(SUFFIXES);
}

export function getLandHexes(hexMap) {
  return [...hexMap.values()].filter(h => h.walkable);
}
