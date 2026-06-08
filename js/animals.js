import { BIOME_BY_ID } from './biomes.js';
import { hexKey } from './hex.js';

const WILDLIFE_BY_BIOME = {
  5: ['deer', 'rabbit'],
  6: ['antelope', 'hyena'],
  7: ['deer', 'wolf'],
  8: ['bear', 'wolf'],
  9: ['moose', 'lynx'],
  10: ['caribou', 'fox'],
  17: ['rabbit', 'deer'],
  19: ['jaguar', 'monkey'],
};

export function initWildlife(world, rng) {
  const animals = [];
  for (const hex of world.hexMap.values()) {
    if (!hex.walkable || hex.settlementId) continue;
    const types = WILDLIFE_BY_BIOME[hex.biomeId];
    if (!types || rng.next() > 0.28) continue;
    const count = rng.int(1, 3);
    hex.wildlife = count;
    for (let i = 0; i < count; i++) {
      animals.push({
        id: `animal_${hex.q}_${hex.r}_${i}`,
        type: rng.pick(types),
        category: 'wildlife',
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

const ANIMAL_COLORS = {
  deer: '#c8a878', rabbit: '#d8c8b0', wolf: '#708090', bear: '#5a4030',
  cow: '#f0e0c0', chicken: '#ffe8a0', sheep: '#e8e8f0', fox: '#d08040',
  moose: '#6a5040', lynx: '#a08060', antelope: '#d0b890', hyena: '#908070',
  jaguar: '#c87830', monkey: '#a07040', caribou: '#b09070',
};

export function getAnimalColor(type) {
  return ANIMAL_COLORS[type] || '#90a070';
}

export function tickAnimals(animals, world, agents, tick) {
  for (const animal of animals) {
    if (tick % 12 === 0 && animal.category === 'wildlife') {
      const neighbors = [[0,1],[1,0],[-1,1],[1,-1],[0,-1],[-1,0]].map(([dq,dr]) => ({
        q: animal.q + dq, r: animal.r + dr,
      })).filter(n => world.hexMap.has(hexKey(n.q, n.r)));
      if (neighbors.length && Math.random() < 0.35) {
        const n = neighbors[Math.floor(Math.random() * neighbors.length)];
        const hex = world.hexMap.get(hexKey(n.q, n.r));
        if (hex?.walkable && !hex.settlementId) {
          animal.q = n.q;
          animal.r = n.r;
          animal.hexKey = hexKey(n.q, n.r);
        }
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
