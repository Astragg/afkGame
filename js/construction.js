import { hexKey } from './hex.js';
import { addJobSlots } from './worldgen.js';
import { payFromWallet } from './currency.js';

export const BUILDING_DEFS = {
  home:       { ticks: 72,  cost: { silver: 80,  copper: 0 },   capacity: 2, label: 'Home' },
  farm:       { ticks: 96,  cost: { silver: 120, copper: 0 },   capacity: 0, label: 'Farm' },
  market:     { ticks: 120, cost: { silver: 200, copper: 0 },   capacity: 0, label: 'Market' },
  tavern:     { ticks: 96,  cost: { silver: 150, copper: 0 },   capacity: 0, label: 'Tavern' },
  barracks:   { ticks: 168, cost: { silver: 250, copper: 0 },   capacity: 0, label: 'Barracks' },
  temple:     { ticks: 200, cost: { silver: 300, gems: 1 },     capacity: 0, label: 'Temple' },
  prison:     { ticks: 144, cost: { silver: 180, copper: 0 },   capacity: 4, label: 'Prison' },
  guild_hall: { ticks: 180, cost: { silver: 220, tokens: 2 },   capacity: 0, label: 'Guild Hall' },
  granary:    { ticks: 108, cost: { silver: 100, copper: 0 },   capacity: 0, label: 'Granary' },
};

export function queueConstruction(settlement, hex, type, tick) {
  const def = BUILDING_DEFS[type];
  if (!def) return false;
  const treasury = settlement.treasuryWallet || { gold: 0, silver: settlement.treasury || 0, copper: 0, gems: 0, tokens: 0 };
  for (const [cur, amt] of Object.entries(def.cost)) {
    if ((treasury[cur] || 0) < amt) return false;
    treasury[cur] -= amt;
  }
  settlement.treasuryWallet = treasury;
  settlement.treasury = Math.floor((treasury.gold || 0) * 100 + (treasury.silver || 0));

  const site = {
    id: `build_${settlement.id}_${tick}_${hex.q}_${hex.r}`,
    type,
    hex: { q: hex.q, r: hex.r },
    progress: 0,
    totalTicks: def.ticks,
    startedTick: tick,
    workers: [],
  };
  settlement.constructionQueue = settlement.constructionQueue || [];
  settlement.constructionQueue.push(site);
  hex.building = { type, settlementId: settlement.id, underConstruction: true, siteId: site.id, progress: 0 };
  return site;
}

export function tickConstruction(world, agents, tick) {
  if (tick % 12 === 0) {
    for (const settlement of world.settlements) {
      for (const a of agents) {
        if (!a.dead && a.settlementId === settlement.id && !a.hasHome) {
          assignAgentHome(a, settlement, world);
        }
      }
    }
  }
  for (const settlement of world.settlements) {
    const queue = settlement.constructionQueue || [];
    for (const site of queue) {
      if (site.progress >= site.totalTicks) continue;
      const hex = world.hexMap.get(hexKey(site.hex.q, site.hex.r));
      if (!hex) continue;

      const nearby = agents.filter(a =>
        !a.dead && a.settlementId === settlement.id &&
        Math.abs(a.q - site.hex.q) + Math.abs(a.r - site.hex.r) <= 2 &&
        (a.currentAction === 'work' || a.job === 'blacksmith' || !a.job)
      );
      const workPower = 1 + nearby.length * 0.5;
      site.progress += workPower;
      if (hex.building) hex.building.progress = site.progress / site.totalTicks;

      if (site.progress >= site.totalTicks) {
        completeConstruction(settlement, site, hex, world);
      }
    }
    settlement.constructionQueue = queue.filter(s => s.progress < s.totalTicks);
  }
}

function completeConstruction(settlement, site, hex, world) {
  const def = BUILDING_DEFS[site.type];
  hex.building = {
    type: site.type,
    settlementId: settlement.id,
    capacity: def?.capacity || 0,
    residents: [],
    hexQ: site.hex.q,
    hexR: site.hex.r,
    completedTick: site.startedTick + site.totalTicks,
  };
  settlement.buildings.push({ type: site.type, hex: { ...site.hex }, completed: true });
  addJobSlots(settlement, site.type);
  if (site.type === 'home' && world._agents) autoAssignHomeless(settlement, world, world._agents);
}

export function assignResidentsToNewHomes(settlement, world) {
  const homes = settlement.buildings
    .filter(b => b.type === 'home' && b.completed !== false)
    .map(b => world.hexMap.get(hexKey(b.hex.q, b.hex.r))?.building)
    .filter(b => b && !b.underConstruction);

  for (const home of homes) {
    home.residents = home.residents || [];
    home.capacity = home.capacity || BUILDING_DEFS.home.capacity;
  }
}

export function assignAgentHome(agent, settlement, world) {
  const homes = getCompletedHomes(settlement, world);
  for (const { building: home, hex } of homes) {
    home.residents = home.residents || [];
    if (home.residents.length < (home.capacity || 2)) {
      home.residents.push(agent.id);
      agent.homeQ = hex.q;
      agent.homeR = hex.r;
      agent.hasHome = true;
      agent.homeless = false;
      agent.homeBuildingId = hexKey(hex.q, hex.r);
      return true;
    }
  }
  agent.hasHome = false;
  agent.homeless = true;
  return false;
}

function getCompletedHomes(settlement, world) {
  return (settlement.buildings || [])
    .filter(b => b.type === 'home' && b.completed !== false)
    .map(b => {
      const hex = world.hexMap.get(hexKey(b.hex.q, b.hex.r));
      return hex?.building && !hex.building.underConstruction ? { building: hex.building, hex } : null;
    })
    .filter(Boolean);
}

function autoAssignHomeless(settlement, world, agents) {
  for (const a of agents) {
    if (!a.dead && a.settlementId === settlement.id && !a.hasHome) {
      assignAgentHome(a, settlement, world);
    }
  }
}

export function agentAtHome(agent, world) {
  if (!agent.hasHome) return false;
  const hex = world.hexMap.get(hexKey(agent.q, agent.r));
  if (!hex?.building || hex.building.type !== 'home' || hex.building.underConstruction) return false;
  return hex.building.residents?.includes(agent.id);
}

export function initSettlementConstruction(hexMap, settlements, rng, tick = 0) {
  const plans = ['home', 'home', 'farm', 'market', 'tavern', 'home', 'barracks', 'granary'];
  for (const settlement of settlements) {
    settlement.constructionQueue = [];
    settlement.treasuryWallet = settlement.treasuryWallet || {
      gold: Math.floor((settlement.treasury || 500) / 100),
      silver: (settlement.treasury || 500) % 100,
      copper: 0, gems: rng.int(0, 3), tokens: rng.int(0, 5),
    };
    const center = hexMap.get(hexKey(settlement.hex.q, settlement.hex.r));
    if (center) {
      center.building = { type: 'town_center', settlementId: settlement.id, completed: true };
      settlement.buildings.push({ type: 'town_center', hex: { ...settlement.hex }, completed: true });
    }

    const candidates = [];
    for (const hex of hexMap.values()) {
      if (hex.settlementId === settlement.id && hex.walkable && !hex.building &&
          (hex.q !== settlement.hex.q || hex.r !== settlement.hex.r)) {
        candidates.push(hex);
      }
    }
    const shuffled = rng.shuffle(candidates);
    const instantHomes = shuffled.splice(0, 2 + rng.int(0, 1));
    for (const hex of instantHomes) {
      completeConstruction(settlement, {
        type: 'home', hex: { q: hex.q, r: hex.r }, startedTick: tick, totalTicks: 0,
      }, hex, { hexMap, _agents: [] });
    }

    const toBuild = shuffled.slice(0, 4 + rng.int(0, 4));
    const types = rng.shuffle([...plans]).slice(0, toBuild.length);
    toBuild.forEach((hex, i) => {
      const type = types[i] || 'home';
      queueConstruction(settlement, hex, type, tick);
      siteProgressBoost(settlement, hex, rng);
    });
  }
}

function siteProgressBoost(settlement, hex, rng) {
  const site = settlement.constructionQueue?.find(s => s.hex.q === hex.q && s.hex.r === hex.r);
  if (site) site.progress = rng.int(0, Math.floor(site.totalTicks * 0.3));
}

export function planNewBuildings(world, rng, tick) {
  if (tick % 168 !== 0) return;
  for (const settlement of world.settlements) {
    const homeless = settlement.population - countHomed(settlement, world);
    if (homeless > 2) {
      const hex = findEmptySettlementHex(settlement, world.hexMap);
      if (hex && queueConstruction(settlement, hex, 'home', tick)) {
        hex.settlementId = settlement.id;
      }
    }
    if (settlement.population > 15 && !settlement.buildings.some(b => b.type === 'market')) {
      const hex = findEmptySettlementHex(settlement, world.hexMap);
      if (hex) { hex.settlementId = settlement.id; queueConstruction(settlement, hex, 'market', tick); }
    }
  }
}

function countHomed(settlement, world) {
  let n = 0;
  for (const b of settlement.buildings || []) {
    if (b.type === 'home') {
      const hex = world.hexMap.get(hexKey(b.hex.q, b.hex.r));
      n += hex?.building?.residents?.length || 0;
    }
  }
  return n;
}

function findEmptySettlementHex(settlement, hexMap) {
  const candidates = [...hexMap.values()].filter(h =>
    h.settlementId === settlement.id && h.walkable && !h.building && !h.dungeon
  );
  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}
