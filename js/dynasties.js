import { EVENT } from './events.js';
import { awardMilestone } from './milestones.js';

export function initDynasties() {
  return { houses: {}, currentRulers: {} };
}

function houseKey(name) {
  return (name || 'Unknown').replace(/^House /, '');
}

export function getOrCreateHouse(dynasties, name, founderId, tick) {
  const key = houseKey(name);
  if (!dynasties.houses[key]) {
    dynasties.houses[key] = {
      name: name.startsWith('House') ? name : `House ${key}`,
      founderId,
      foundedTick: tick,
      ruleTicks: 0,
      rulers: [],
      conquests: 0,
      warsWon: 0,
      heirs: 0,
      settlements: [],
    };
  }
  return dynasties.houses[key];
}

export function tickDynasties(dynasties, world, agents, bus, tick, milestones) {
  if (tick % 24 !== 0) return;

  for (const settlement of world.settlements) {
    const rulerId = settlement.rulerId;
    if (!rulerId) continue;
    const ruler = agents.find(a => a.id === rulerId && !a.dead);
    if (!ruler) continue;

    const dynastyName = settlement.dynastyName || ruler.dynastyName || `House ${ruler.name.split(' ').pop() || ruler.name}`;
    const house = getOrCreateHouse(dynasties, dynastyName, rulerId, tick);

    const prevRuler = dynasties.currentRulers[settlement.id];
    if (prevRuler !== rulerId) {
      house.rulers.push({ id: rulerId, name: ruler.name, startTick: tick });
      dynasties.currentRulers[settlement.id] = rulerId;
      if (prevRuler) {
        bus.emit(EVENT.DYNASTY_CHANGE, { settlement: settlement.id, house: house.name, ruler: ruler.name, tick });
      }
    }

    house.ruleTicks += 1;
    if (house.ruleTicks === 100 && milestones) {
      awardMilestone(milestones, 'dynasty_100days', tick, bus, { house: house.name });
    }
    if (!house.settlements.includes(settlement.id)) house.settlements.push(settlement.id);
    settlement.dynastyName = house.name;
    ruler.dynastyName = house.name;
  }
}

export function setupDynastyListeners(dynasties, bus) {
  bus.on('succession', (evt) => {
    const { settlement, ruler, type, tick } = evt.data;
    // heir succession counts
    if (type === 'peaceful') {
      for (const h of Object.values(dynasties.houses)) h.heirs += 1;
    }
  });
  bus.on(EVENT.CONQUEST, (evt) => {
    const { tick } = evt.data;
    for (const h of Object.values(dynasties.houses)) {
      if (h.settlements.length > 0) h.conquests += 1;
    }
  });
  bus.on(EVENT.WAR_START, (evt) => {
    // tracked passively
  });
}

export function getDynastyLeaderboard(dynasties) {
  return Object.values(dynasties.houses)
    .sort((a, b) => (b.ruleTicks + b.conquests * 50) - (a.ruleTicks + a.conquests * 50))
    .slice(0, 12);
}
