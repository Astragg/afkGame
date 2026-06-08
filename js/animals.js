import { BIOME_BY_ID, BIOMES } from './biomes.js';
import { hexKey } from './hex.js';

/** Climate zones used for wildlife distribution */
export const CLIMATES = {
  temperate: { label: 'Temperate', icon: '🌤' },
  meadow:    { label: 'Meadow',    icon: '🌾' },
  boreal:    { label: 'Boreal',    icon: '🌲' },
  arctic:    { label: 'Arctic',    icon: '❄' },
  savanna:   { label: 'Savanna',   icon: '🌅' },
  arid:      { label: 'Arid',      icon: '🏜' },
  tropical:  { label: 'Tropical',  icon: '🌴' },
  wetland:   { label: 'Wetland',   icon: '🐸' },
  coastal:   { label: 'Coastal',   icon: '🏖' },
  highland:  { label: 'Highland',  icon: '⛰' },
  wasteland: { label: 'Wasteland', icon: '☠' },
};

export const ANIMAL_SPECIES = {
  rabbit: {
    label: 'Rabbit', icon: '🐇', diet: 'Herbivore', danger: 'Passive',
    climates: ['temperate', 'meadow'],
    biomes: [BIOMES.GRASSLAND.id, BIOMES.MEADOW.id, BIOMES.FOREST.id],
    temp: [0.28, 0.62], moisture: [0.35, 0.72],
    habitat: 'Temperate meadows & grasslands',
  },
  deer: {
    label: 'Deer', icon: '🦌', diet: 'Herbivore', danger: 'Passive',
    climates: ['temperate', 'meadow', 'boreal'],
    biomes: [BIOMES.GRASSLAND.id, BIOMES.MEADOW.id, BIOMES.FOREST.id, BIOMES.TAIGA.id],
    temp: [0.22, 0.58], moisture: [0.3, 0.7],
    habitat: 'Forests & open woodland',
  },
  fox: {
    label: 'Fox', icon: '🦊', diet: 'Omnivore', danger: 'Passive',
    climates: ['temperate', 'meadow', 'boreal', 'arctic'],
    biomes: [BIOMES.GRASSLAND.id, BIOMES.MEADOW.id, BIOMES.FOREST.id, BIOMES.TAIGA.id, BIOMES.TUNDRA.id],
    temp: [0.15, 0.55], moisture: [0.2, 0.65],
    habitat: 'Woodland edges & tundra',
  },
  wolf: {
    label: 'Wolf', icon: '🐺', diet: 'Carnivore', danger: 'Aggressive',
    climates: ['temperate', 'boreal'],
    biomes: [BIOMES.FOREST.id, BIOMES.DENSE_FOREST.id, BIOMES.TAIGA.id],
    temp: [0.18, 0.48], moisture: [0.35, 0.75],
    habitat: 'Dense forests & taiga',
  },
  bear: {
    label: 'Bear', icon: '🐻', diet: 'Omnivore', danger: 'Dangerous',
    climates: ['temperate', 'boreal'],
    biomes: [BIOMES.FOREST.id, BIOMES.DENSE_FOREST.id, BIOMES.TAIGA.id],
    temp: [0.15, 0.45], moisture: [0.4, 0.8],
    habitat: 'Deep forests & taiga',
  },
  moose: {
    label: 'Moose', icon: '🫎', diet: 'Herbivore', danger: 'Aggressive',
    climates: ['boreal', 'wetland'],
    biomes: [BIOMES.TAIGA.id, BIOMES.MARSH.id, BIOMES.SWAMP.id],
    temp: [0.12, 0.38], moisture: [0.45, 0.85],
    habitat: 'Taiga & marshlands',
  },
  lynx: {
    label: 'Lynx', icon: '🐱', diet: 'Carnivore', danger: 'Aggressive',
    climates: ['boreal', 'arctic'],
    biomes: [BIOMES.TAIGA.id, BIOMES.TUNDRA.id, BIOMES.SNOW.id],
    temp: [0.08, 0.35], moisture: [0.25, 0.65],
    habitat: 'Snowy taiga & tundra',
  },
  caribou: {
    label: 'Caribou', icon: '🦌', diet: 'Herbivore', danger: 'Passive',
    climates: ['arctic', 'boreal'],
    biomes: [BIOMES.TUNDRA.id, BIOMES.SNOW.id, BIOMES.TAIGA.id],
    temp: [0, 0.28], moisture: [0.15, 0.55],
    habitat: 'Tundra & snow fields',
  },
  antelope: {
    label: 'Antelope', icon: '🦌', diet: 'Herbivore', danger: 'Passive',
    climates: ['savanna', 'arid'],
    biomes: [BIOMES.SAVANNA.id, BIOMES.GRASSLAND.id, BIOMES.BADLANDS.id],
    temp: [0.55, 0.85], moisture: [0.15, 0.5],
    habitat: 'Savanna & dry plains',
  },
  hyena: {
    label: 'Hyena', icon: '🐾', diet: 'Carnivore', danger: 'Aggressive',
    climates: ['savanna', 'arid'],
    biomes: [BIOMES.SAVANNA.id, BIOMES.BADLANDS.id, BIOMES.DESERT.id],
    temp: [0.6, 0.9], moisture: [0.1, 0.45],
    habitat: 'Savanna & badlands',
  },
  camel: {
    label: 'Camel', icon: '🐫', diet: 'Herbivore', danger: 'Passive',
    climates: ['arid'],
    biomes: [BIOMES.DESERT.id, BIOMES.DUNES.id],
    temp: [0.65, 1], moisture: [0, 0.28],
    habitat: 'Deserts & dunes',
  },
  scorpion: {
    label: 'Scorpion', icon: '🦂', diet: 'Carnivore', danger: 'Dangerous',
    climates: ['arid'],
    biomes: [BIOMES.DESERT.id, BIOMES.DUNES.id, BIOMES.BADLANDS.id],
    temp: [0.58, 1], moisture: [0, 0.25],
    habitat: 'Scorching desert sands',
  },
  jaguar: {
    label: 'Jaguar', icon: '🐆', diet: 'Carnivore', danger: 'Dangerous',
    climates: ['tropical'],
    biomes: [BIOMES.JUNGLE.id],
    temp: [0.68, 1], moisture: [0.6, 1],
    habitat: 'Dense jungle',
  },
  monkey: {
    label: 'Monkey', icon: '🐒', diet: 'Omnivore', danger: 'Passive',
    climates: ['tropical', 'wetland'],
    biomes: [BIOMES.JUNGLE.id, BIOMES.SWAMP.id],
    temp: [0.62, 1], moisture: [0.55, 1],
    habitat: 'Jungle canopy & swamps',
  },
  crocodile: {
    label: 'Crocodile', icon: '🐊', diet: 'Carnivore', danger: 'Dangerous',
    climates: ['wetland', 'tropical'],
    biomes: [BIOMES.SWAMP.id, BIOMES.MARSH.id],
    temp: [0.45, 0.9], moisture: [0.65, 1],
    habitat: 'Swamps & marshes',
  },
  crab: {
    label: 'Crab', icon: '🦀', diet: 'Omnivore', danger: 'Passive',
    climates: ['coastal'],
    biomes: [BIOMES.BEACH.id],
    temp: [0.35, 0.85], moisture: [0.3, 0.8],
    habitat: 'Sandy beaches',
  },
  mountain_goat: {
    label: 'Mountain Goat', icon: '🐐', diet: 'Herbivore', danger: 'Passive',
    climates: ['highland'],
    biomes: [BIOMES.HIGHLANDS.id, BIOMES.VOLCANIC.id],
    temp: [0.1, 0.55], moisture: [0.1, 0.55],
    habitat: 'Rocky highlands & peaks',
  },
  shadow_beast: {
    label: 'Shadow Beast', icon: '👾', diet: 'Carnivore', danger: 'Dangerous',
    climates: ['wasteland'],
    biomes: [BIOMES.CORRUPTED.id, BIOMES.CRYSTAL_CAVERN.id],
    temp: [0.2, 0.7], moisture: [0, 0.5],
    habitat: 'Corrupted wastelands',
  },
  // Livestock (domestic — any settled temperate land)
  cow: {
    label: 'Cow', icon: '🐄', diet: 'Herbivore', danger: 'Passive',
    climates: ['temperate', 'meadow'], biomes: [], temp: [0.2, 0.7], moisture: [0.25, 0.75],
    habitat: 'Domestic — farms & pastures', domestic: true,
  },
  chicken: {
    label: 'Chicken', icon: '🐔', diet: 'Omnivore', danger: 'Passive',
    climates: ['temperate', 'meadow', 'savanna'], biomes: [], temp: [0.2, 0.8], moisture: [0.2, 0.7],
    habitat: 'Domestic — farms & yards', domestic: true,
  },
  sheep: {
    label: 'Sheep', icon: '🐑', diet: 'Herbivore', danger: 'Passive',
    climates: ['temperate', 'meadow', 'highland'], biomes: [], temp: [0.15, 0.6], moisture: [0.25, 0.65],
    habitat: 'Domestic — hills & pastures', domestic: true,
  },
};

const ANIMAL_COLORS = {
  deer: '#c8a878', rabbit: '#d8c8b0', wolf: '#708090', bear: '#5a4030',
  cow: '#f0e0c0', chicken: '#ffe8a0', sheep: '#e8e8f0', fox: '#d08040',
  moose: '#6a5040', lynx: '#a08060', antelope: '#d0b890', hyena: '#908070',
  jaguar: '#c87830', monkey: '#a07040', caribou: '#b09070',
  camel: '#c8a060', scorpion: '#8a4020', crocodile: '#4a7050', crab: '#d06050',
  mountain_goat: '#b0b0b8', shadow_beast: '#6040a0',
};

/** Derive climate zone from hex biome + temperature/moisture */
export function getHexClimate(hex) {
  if (!hex) return 'temperate';
  const b = hex.biomeId;
  const t = hex.temperature ?? 0.5;
  const m = hex.moisture ?? 0.5;

  if (b === BIOMES.JUNGLE.id) return 'tropical';
  if (b === BIOMES.SWAMP.id || b === BIOMES.MARSH.id) return 'wetland';
  if (b === BIOMES.DESERT.id || b === BIOMES.DUNES.id) return 'arid';
  if (b === BIOMES.SNOW.id || b === BIOMES.TUNDRA.id) return 'arctic';
  if (b === BIOMES.TAIGA.id) return 'boreal';
  if (b === BIOMES.SAVANNA.id) return 'savanna';
  if (b === BIOMES.BADLANDS.id) return t > 0.6 ? 'savanna' : 'arid';
  if (b === BIOMES.HIGHLANDS.id || b === BIOMES.VOLCANIC.id) return 'highland';
  if (b === BIOMES.BEACH.id) return 'coastal';
  if (b === BIOMES.CORRUPTED.id || b === BIOMES.CRYSTAL_CAVERN.id) return 'wasteland';
  if (b === BIOMES.MEADOW.id) return 'meadow';
  if (t < 0.22) return 'arctic';
  if (t < 0.36) return 'boreal';
  if (t > 0.75 && m > 0.55) return 'tropical';
  if (t > 0.68 && m < 0.4) return 'savanna';
  if (m < 0.2 && t > 0.55) return 'arid';
  return 'temperate';
}

export function getClimateLabel(climate) {
  return CLIMATES[climate]?.label || climate;
}

/** Check if a species can inhabit a hex */
export function animalFitsHex(type, hex) {
  const sp = ANIMAL_SPECIES[type];
  if (!sp || !hex?.walkable || hex.settlementId) return false;

  const climate = getHexClimate(hex);
  const t = hex.temperature ?? 0.5;
  const m = hex.moisture ?? 0.5;

  if (!sp.climates.includes(climate)) return false;
  if (sp.biomes.length && !sp.biomes.includes(hex.biomeId)) return false;
  if (t < sp.temp[0] || t > sp.temp[1]) return false;
  if (m < sp.moisture[0] || m > sp.moisture[1]) return false;
  return true;
}

/** Weighted list of wildlife species valid for a hex */
function wildlifeCandidates(hex) {
  const climate = getHexClimate(hex);
  const candidates = [];
  for (const [type, sp] of Object.entries(ANIMAL_SPECIES)) {
    if (sp.domestic) continue;
    if (!animalFitsHex(type, hex)) continue;
    // Prefer species whose primary climate matches
    const weight = sp.climates[0] === climate ? 1.5 : 1.0;
    candidates.push({ type, weight });
  }
  return candidates;
}

export function getAnimalInfo(type) {
  const sp = ANIMAL_SPECIES[type];
  if (!sp) return { label: type, icon: '🐾', diet: 'Unknown', danger: 'Unknown', habitat: 'Unknown' };
  return sp;
}

export function getAnimalColor(type) {
  return ANIMAL_COLORS[type] || '#90a070';
}

export function initWildlife(world, rng) {
  const animals = [];
  for (const hex of world.hexMap.values()) {
    if (!hex.walkable || hex.settlementId) continue;
    const candidates = wildlifeCandidates(hex);
    if (!candidates.length) continue;
    // Spawn chance scales with biome suitability
    const climate = getHexClimate(hex);
    const spawnChance = climate === 'wasteland' ? 0.18 : climate === 'arid' ? 0.15 : 0.28;
    if (rng.next() > spawnChance) continue;

    const count = rng.int(1, climate === 'arctic' ? 2 : 3);
    hex.wildlife = count;
    for (let i = 0; i < count; i++) {
      const totalW = candidates.reduce((s, c) => s + c.weight, 0);
      let roll = rng.next() * totalW;
      let type = candidates[0].type;
      for (const c of candidates) {
        roll -= c.weight;
        if (roll <= 0) { type = c.type; break; }
      }
      animals.push({
        id: `animal_${hex.q}_${hex.r}_${i}`,
        type,
        category: 'wildlife',
        climate: getHexClimate(hex),
        q: hex.q,
        r: hex.r,
        health: 30,
        hexKey: hexKey(hex.q, hex.r),
      });
    }
  }
  return animals;
}

export function initLivestock(settlements, rng) {
  const animals = [];
  for (const settlement of settlements) {
    const farms = settlement.buildings.filter(b => b.type === 'farm').length;
    for (let i = 0; i < farms * 2; i++) {
      const type = rng.pick(['cow', 'chicken', 'sheep']);
      animals.push({
        id: `livestock_${settlement.id}_${i}`,
        type,
        category: 'livestock',
        settlementId: settlement.id,
        q: settlement.hex.q + rng.int(-1, 1),
        r: settlement.hex.r + rng.int(-1, 1),
        health: 50,
        fed: true,
      });
    }
  }
  return animals;
}

export function tickAnimals(animals, world, agents, tick) {
  for (const animal of animals) {
    if (tick % 12 === 0 && animal.category === 'wildlife') {
      const neighbors = [[0,1],[1,0],[-1,1],[1,-1],[0,-1],[-1,0]].map(([dq,dr]) => ({
        q: animal.q + dq, r: animal.r + dr,
      })).filter(n => world.hexMap.has(hexKey(n.q, n.r)));

      // Only move to hexes matching this species' climate requirements
      const valid = neighbors.filter(n => {
        const hex = world.hexMap.get(hexKey(n.q, n.r));
        return animalFitsHex(animal.type, hex);
      });

      if (valid.length && Math.random() < 0.35) {
        const n = valid[Math.floor(Math.random() * valid.length)];
        const hex = world.hexMap.get(hexKey(n.q, n.r));
        animal.q = n.q;
        animal.r = n.r;
        animal.hexKey = hexKey(n.q, n.r);
        animal.climate = getHexClimate(hex);
      }
    }
    if (animal.category === 'livestock' && tick % 24 === 0) {
      const settlement = world.settlements.find(s => s.id === animal.settlementId);
      if (settlement) {
        if (settlement.foodStore > 1) {
          settlement.foodStore -= 0.5;
          animal.fed = true;
          if (animal.type === 'cow' && tick % 48 === 0) settlement.foodStore += 2;
        } else {
          animal.fed = false;
          animal.health -= 5;
        }
      }
    }
    if (animal.category === 'wildlife' && tick % 48 === 0) {
      const hex = world.hexMap.get(animal.hexKey);
      if (hex) hex.wildlife = Math.min(5, (hex.wildlife || 0) + 0.2);
    }
  }
  return animals.filter(a => a.health > 0);
}

export function hunt(agent, hex, animals) {
  const nearby = animals.filter(a =>
    a.category === 'wildlife' && a.q === hex.q && a.r === hex.r
  );
  if (!nearby.length) return null;
  const prey = nearby[0];
  const skill = agent.skills?.['survival.hunt'] || 0;
  if (Math.random() > 0.4 + skill * 0.05) return null;
  prey.health = 0;
  hex.wildlife = Math.max(0, (hex.wildlife || 1) - 1);
  const food = 3 + skill;
  agent.inventory.push({ type: 'meat', qty: food });
  return { food, prey: prey.type };
}

export function fish(agent, hex) {
  const biome = BIOME_BY_ID[hex.biomeId];
  if (!biome?.water && hex.waterDepth < 0.3) return null;
  const skill = agent.skills?.['survival.fish'] || 0;
  if (Math.random() > 0.5 + skill * 0.05) return null;
  const food = 2 + skill;
  agent.inventory.push({ type: 'fish', qty: food });
  return { food };
}
