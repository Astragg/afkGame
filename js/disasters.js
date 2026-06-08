import { hexKey } from './hex.js';
import { EVENT } from './events.js';

/** Natural disasters + extreme weather: plague, drought, fire, flood, blizzard, heatwave, thunderstorm */

export function tickDisasters(world, agents, bus, tick, rng, season) {
  if (tick % 96 !== 0) return;
  const baseChance = season === 'winter' ? 0.10 : season === 'summer' ? 0.07 : 0.05;
  if (rng.next() > baseChance) return;

  const settlement = rng.pick(world.settlements);
  if (!settlement) return;

  const pool    = ['plague', 'drought', 'fire', 'flood', 'blizzard', 'heatwave', 'thunderstorm'];
  const weights = season === 'winter' ? [3, 1, 1, 2, 5, 0, 1]
                : season === 'summer' ? [1, 4, 4, 1, 0, 5, 2]
                : season === 'spring' ? [2, 1, 1, 3, 0, 1, 3]
                :                       [2, 2, 2, 2, 1, 1, 2];
  const type = _weightedPick(pool, weights, rng);

  switch (type) {
    case 'plague':      _plague(settlement, agents, bus, tick, rng); break;
    case 'drought':     _drought(settlement, bus, tick); break;
    case 'fire':        _fire(settlement, world, bus, tick, rng); break;
    case 'flood':       _flood(settlement, bus, tick); break;
    case 'blizzard':    _blizzard(settlement, agents, bus, tick, rng); break;
    case 'heatwave':    _heatwave(settlement, agents, bus, tick); break;
    case 'thunderstorm':_thunderstorm(settlement, world, bus, tick, rng); break;
  }
}

function _plague(settlement, agents, bus, tick, rng) {
  const residents = agents.filter(a => !a.dead && a.settlementId === settlement.id);
  let killed = 0, sick = 0;
  for (const a of residents) {
    if (rng.next() < 0.18) {
      a.health = Math.max(0, a.health - rng.int(25, 65));
      sick++;
      a.addEvent(tick, 'Struck down by plague');
      if (a.health <= 0) { a.dead = true; killed++; }
    }
  }
  _pushEvent(settlement, `⚠ Plague: ${killed} dead, ${sick} sick`, tick);
  bus.emit('disaster', { type: 'plague', settlement: settlement.id, killed, tick });
}

function _drought(settlement, bus, tick) {
  settlement.droughtTicks = (settlement.droughtTicks || 0) + 60 + Math.floor(Math.random() * 60);
  _pushEvent(settlement, `⚠ Drought! Food output halved for months`, tick);
  bus.emit('disaster', { type: 'drought', settlement: settlement.id, tick });
}

function _fire(settlement, world, bus, tick, rng) {
  const burnable = settlement.buildings.filter(b => b.completed && b.type !== 'town_center' && b.type !== 'prison');
  if (!burnable.length) { _flood(settlement, bus, tick); return; }
  const target = rng.pick(burnable);
  // Remove from hex map
  const anchorHex = world.hexMap.get(hexKey(target.hex.q, target.hex.r));
  if (anchorHex?.building) {
    const fp = _getFootprint(target.type);
    for (const [dq, dr] of fp) {
      const tile = world.hexMap.get(hexKey(target.hex.q + dq, target.hex.r + dr));
      if (tile?.building?.settlementId === settlement.id) tile.building = null;
    }
  }
  settlement.buildings = settlement.buildings.filter(b => b !== target);
  _pushEvent(settlement, `🔥 Fire destroyed the ${target.type.replace('_', ' ')}!`, tick);
  bus.emit('disaster', { type: 'fire', settlement: settlement.id, building: target.type, tick });
}

function _flood(settlement, bus, tick) {
  const loss = Math.floor((settlement.foodStore || 0) * (0.3 + Math.random() * 0.3));
  settlement.foodStore = Math.max(0, (settlement.foodStore || 0) - loss);
  _pushEvent(settlement, `🌊 Flood destroyed ${loss} food stores`, tick);
  bus.emit('disaster', { type: 'flood', settlement: settlement.id, loss, tick });
}

function _blizzard(settlement, agents, bus, tick, rng) {
  const residents = agents.filter(a => !a.dead && a.settlementId === settlement.id);
  let frozen = 0;
  for (const a of residents) {
    if (rng.next() < 0.25) {
      a.health = Math.max(1, a.health - rng.int(10, 30));
      a.needs && (a.needs.warmth = Math.max(0, (a.needs.warmth || 80) - 40));
      frozen++;
    }
  }
  const foodLoss = Math.floor((settlement.foodStore || 0) * 0.2);
  settlement.foodStore = Math.max(0, (settlement.foodStore || 0) - foodLoss);
  settlement.blizzardTicks = 36;
  _pushEvent(settlement, `❄ Blizzard! ${frozen} residents freezing, ${foodLoss} food lost`, tick);
  bus.emit(EVENT.EXTREME_WEATHER, { type: 'blizzard', settlement: settlement.id, tick });
}

function _heatwave(settlement, agents, bus, tick) {
  const residents = agents.filter(a => !a.dead && a.settlementId === settlement.id);
  let parched = 0;
  for (const a of residents) {
    if (Math.random() < 0.3) {
      a.health = Math.max(1, a.health - Math.floor(Math.random() * 15 + 5));
      a.needs && (a.needs.hunger = Math.max(0, (a.needs.hunger || 80) - 20));
      parched++;
    }
  }
  const cropLoss = Math.floor((settlement.foodStore || 0) * 0.15);
  settlement.foodStore = Math.max(0, (settlement.foodStore || 0) - cropLoss);
  settlement.heatwaveTicks = 48;
  _pushEvent(settlement, `🔆 Heatwave! ${parched} suffering, crops scorched (−${cropLoss} food)`, tick);
  bus.emit(EVENT.EXTREME_WEATHER, { type: 'heatwave', settlement: settlement.id, tick });
}

function _thunderstorm(settlement, world, bus, tick, rng) {
  // 30% chance to strike a building
  if (rng.next() < 0.3) {
    const burnable = settlement.buildings.filter(b => b.completed);
    if (burnable.length) {
      const target = rng.pick(burnable);
      _pushEvent(settlement, `⚡ Lightning struck the ${target.type.replace('_', ' ')}! It caught fire.`, tick);
      _fire(settlement, world, bus, tick, rng);
      return;
    }
  }
  const foodLoss = Math.floor((settlement.foodStore || 0) * 0.1);
  settlement.foodStore = Math.max(0, (settlement.foodStore || 0) - foodLoss);
  _pushEvent(settlement, `⚡ Thunderstorm battered ${settlement.name}! ${foodLoss} food spoiled.`, tick);
  bus.emit(EVENT.EXTREME_WEATHER, { type: 'thunderstorm', settlement: settlement.id, tick });
}

function _pushEvent(settlement, text, tick) {
  settlement.recentEvents = settlement.recentEvents || [];
  settlement.recentEvents.push({ tick, text });
  if (settlement.recentEvents.length > 12) settlement.recentEvents.shift();
  // Also push to shared events array
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}

function _weightedPick(arr, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

const FOOTPRINTS = {
  town_center: [[0,0],[1,0],[0,-1],[1,-1]],
  barracks:    [[0,0],[1,0],[0,-1],[1,-1]],
  temple:      [[0,0],[1,0],[-1,1],[0,-1]],
  prison:      [[0,0],[1,0],[1,-1],[0,-1]],
  market:      [[0,0],[1,-1],[-1,0]],
  farm:        [[0,0],[1,0],[0,-1]],
  guild_hall:  [[0,0],[1,0],[0,-1]],
  tavern:      [[0,0],[1,-1]],
  granary:     [[0,0],[1,0]],
  home:        [[0,0]],
};
function _getFootprint(type) { return FOOTPRINTS[type] || [[0,0]]; }
