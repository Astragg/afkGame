import { hexKey } from './hex.js';
import { addJobSlots } from './worldgen.js';
import { payFromWallet } from './currency.js';
import { isBuildingUnlocked } from './ages.js';

/** Axial offsets from anchor hex — buildings span multiple tiles */
export const BUILDING_FOOTPRINTS = {
  town_center: [[0, 0], [1, 0], [0, -1], [1, -1]],
  barracks:    [[0, 0], [1, 0], [0, -1], [1, -1]],
  temple:      [[0, 0], [1, 0], [-1, 1], [0, -1]],
  prison:      [[0, 0], [1, 0], [1, -1], [0, -1]],
  market:      [[0, 0], [1, -1], [-1, 0]],
  farm:        [[0, 0], [1, 0], [0, -1]],
  guild_hall:  [[0, 0], [1, 0], [0, -1]],
  tavern:      [[0, 0], [1, -1]],
  granary:     [[0, 0], [1, 0]],
  home:        [[0, 0]],
};

export const BUILDING_DEFS = {
  home:       { ticks: 72,  cost: { silver: 80,  copper: 0 },   capacity: 2, label: 'Home', footprint: 'home' },
  farm:       { ticks: 96,  cost: { silver: 120, copper: 0 },   capacity: 0, label: 'Farm', footprint: 'farm' },
  market:     { ticks: 120, cost: { silver: 200, copper: 0 },   capacity: 0, label: 'Market', footprint: 'market' },
  tavern:     { ticks: 96,  cost: { silver: 150, copper: 0 },   capacity: 0, label: 'Tavern', footprint: 'tavern' },
  barracks:   { ticks: 168, cost: { silver: 250, copper: 0 },   capacity: 0, label: 'Barracks', footprint: 'barracks' },
  temple:     { ticks: 200, cost: { silver: 300, gems: 1 },     capacity: 0, label: 'Temple', footprint: 'temple' },
  prison:     { ticks: 144, cost: { silver: 180, copper: 0 },   capacity: 12, label: 'Prison', footprint: 'prison' },
  guild_hall: { ticks: 180, cost: { silver: 220, tokens: 2 },   capacity: 0, label: 'Guild Hall', footprint: 'guild_hall' },
  granary:    { ticks: 108, cost: { silver: 100, copper: 0 },   capacity: 0, label: 'Granary', footprint: 'granary' },
  town_center:{ ticks: 0,   cost: {}, capacity: 0, label: 'Town Center', footprint: 'town_center' },
};

export function getFootprint(type) {
  return BUILDING_FOOTPRINTS[type] || BUILDING_FOOTPRINTS.home;
}

export function footprintFits(anchor, type, hexMap, settlementId) {
  for (const [dq, dr] of getFootprint(type)) {
    const hex = hexMap.get(hexKey(anchor.q + dq, anchor.r + dr));
    if (!hex?.walkable || hex.dungeon) return false;
    if (hex.building) return false;
    if (hex.settlementId && hex.settlementId !== settlementId) return false;
  }
  return true;
}

export function findFootprintSite(settlement, type, hexMap) {
  const candidates = [...hexMap.values()].filter(h =>
    h.settlementId === settlement.id && h.walkable && !h.dungeon && !h.building
  );
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const hex of candidates) {
    if (footprintFits(hex, type, hexMap, settlement.id)) return hex;
  }
  return null;
}

function applyFootprint(anchorHex, type, settlementId, buildingData, hexMap) {
  const footprint = getFootprint(type);
  for (const [dq, dr] of footprint) {
    const tile = hexMap.get(hexKey(anchorHex.q + dq, anchorHex.r + dr));
    if (!tile) continue;
    const isAnchor = dq === 0 && dr === 0;
    tile.building = {
      ...buildingData,
      isAnchor,
      anchorQ: anchorHex.q,
      anchorR: anchorHex.r,
    };
    if (!tile.settlementId) tile.settlementId = settlementId;
  }
}

export function resolveBuildingAt(hex, hexMap) {
  if (!hex?.building) return null;
  const b = hex.building;
  if (b.isAnchor === false && b.anchorQ != null) {
    const anchor = hexMap.get(hexKey(b.anchorQ, b.anchorR));
    if (anchor?.building) return { hex: anchor, building: anchor.building };
  }
  return { hex, building: b };
}

export function queueConstruction(settlement, hex, type, tick, hexMap) {
  const def = BUILDING_DEFS[type];
  if (!def || !hexMap) return false;
  if (!footprintFits(hex, type, hexMap, settlement.id)) return false;
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
  if (!hexMap) return false;
  applyFootprint(hex, type, settlement.id, {
    type, settlementId: settlement.id, underConstruction: true, siteId: site.id, progress: 0,
  }, hexMap);
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
      const prog = site.progress / site.totalTicks;
      for (const [dq, dr] of getFootprint(site.type)) {
        const t = world.hexMap.get(hexKey(site.hex.q + dq, site.hex.r + dr));
        if (t?.building) t.building.progress = prog;
      }

      if (site.progress >= site.totalTicks) {
        completeConstruction(settlement, site, hex, world);
      }
    }
    settlement.constructionQueue = queue.filter(s => s.progress < s.totalTicks);
  }
}

function completeConstruction(settlement, site, hex, world) {
  const def = BUILDING_DEFS[site.type];
  const buildingData = {
    type: site.type,
    settlementId: settlement.id,
    capacity: def?.capacity || 0,
    residents: [],
    hexQ: site.hex.q,
    hexR: site.hex.r,
    completedTick: site.startedTick + site.totalTicks,
    completed: true,
  };
  applyFootprint(hex, site.type, settlement.id, buildingData, world.hexMap);
  settlement.buildings.push({ type: site.type, hex: { ...site.hex }, completed: true, footprint: site.type });
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

const TIER_BUILD_PLANS = {
  town:    ['home', 'home', 'farm', 'market', 'tavern', 'barracks', 'prison', 'temple', 'guild_hall', 'granary', 'home'],
  village: ['home', 'home', 'farm', 'market', 'tavern', 'barracks', 'prison', 'granary'],
  hamlet:  ['home', 'home', 'farm', 'market', 'tavern', 'granary'],
};

/** Buildings every settlement of a tier starts with (already completed) */
const TIER_GUARANTEED = {
  town:    ['prison', 'barracks'],
  village: ['prison'],
  hamlet:  [],
};

export function getPrisonHex(settlement, world) {
  const record = settlement.buildings?.find(b => b.type === 'prison' && b.completed !== false);
  if (!record) return null;
  const hex = world.hexMap.get(hexKey(record.hex.q, record.hex.r));
  if (!hex?.building || hex.building.underConstruction) return null;
  return hex;
}

export function settlementHasBuilding(settlement, type, includeQueued = false) {
  if (settlement.buildings?.some(b => b.type === type)) return true;
  if (includeQueued && settlement.constructionQueue?.some(s => s.type === type)) return true;
  return false;
}

export function initSettlementConstruction(hexMap, settlements, rng, tick = 0) {
  for (const settlement of settlements) {
    settlement.constructionQueue = [];
    settlement.treasuryWallet = settlement.treasuryWallet || {
      gold: Math.floor((settlement.treasury || 500) / 100),
      silver: (settlement.treasury || 500) % 100,
      copper: 0, gems: rng.int(0, 3), tokens: rng.int(0, 5),
    };
    const center = hexMap.get(hexKey(settlement.hex.q, settlement.hex.r));
    if (center) {
      applyFootprint(center, 'town_center', settlement.id, {
        type: 'town_center', settlementId: settlement.id, completed: true, capacity: 0,
      }, hexMap);
      settlement.buildings.push({ type: 'town_center', hex: { ...settlement.hex }, completed: true, footprint: 'town_center' });
    }

    for (let i = 0; i < 2 + rng.int(0, 1); i++) {
      const hex = findFootprintSite(settlement, 'home', hexMap);
      if (!hex) break;
      completeConstruction(settlement, {
        type: 'home', hex: { q: hex.q, r: hex.r }, startedTick: tick, totalTicks: 0,
      }, hex, { hexMap, _agents: [] });
    }

    const tier = settlement.tier || 'hamlet';
    for (const type of TIER_GUARANTEED[tier] || []) {
      if (settlementHasBuilding(settlement, type)) continue;
      const hex = findFootprintSite(settlement, type, hexMap);
      if (!hex) continue;
      completeConstruction(settlement, {
        type, hex: { q: hex.q, r: hex.r }, startedTick: tick, totalTicks: 0,
      }, hex, { hexMap, _agents: [] });
    }

    const planPool = (TIER_BUILD_PLANS[tier] || TIER_BUILD_PLANS.hamlet)
      .filter(t => !settlementHasBuilding(settlement, t));
    const buildCount = Math.min(planPool.length, 4 + rng.int(0, 4));
    const types = rng.shuffle(planPool).slice(0, buildCount);
    for (const type of types) {
      const hex = findFootprintSite(settlement, type, hexMap);
      if (!hex) continue;
      if (queueConstruction(settlement, hex, type, tick, hexMap)) {
        siteProgressBoost(settlement, hex, rng);
      }
    }
  }
}

function siteProgressBoost(settlement, hex, rng) {
  const site = settlement.constructionQueue?.find(s => s.hex.q === hex.q && s.hex.r === hex.r);
  if (site) site.progress = rng.int(0, Math.floor(site.totalTicks * 0.3));
}

export function planNewBuildings(world, rng, tick) {
  if (tick % 168 !== 0) return;
  const worldAge = world.age || 0;
  for (const settlement of world.settlements) {
    const homeless = settlement.population - countHomed(settlement, world);
    if (homeless > 2) {
      const hex = findFootprintSite(settlement, 'home', world.hexMap);
      if (hex && queueConstruction(settlement, hex, 'home', tick, world.hexMap)) {
        hex.settlementId = settlement.id;
      }
    }
    if (settlement.population > 15 && !settlementHasBuilding(settlement, 'market', true)) {
      const hex = findFootprintSite(settlement, 'market', world.hexMap);
      if (hex) queueConstruction(settlement, hex, 'market', tick, world.hexMap);
    }
    // Every village+ needs a prison once population warrants law enforcement
    const needsPrison = settlement.population >= 8 || (settlement.prisoners?.length || 0) > 0;
    if (needsPrison && !settlementHasBuilding(settlement, 'prison', true)) {
      const hex = findFootprintSite(settlement, 'prison', world.hexMap);
      if (hex) queueConstruction(settlement, hex, 'prison', tick, world.hexMap);
    }
    if (worldAge >= 3 && settlement.tier === 'town' && settlement.population > 20 &&
        !settlementHasBuilding(settlement, 'temple', true) && isBuildingUnlocked('temple', worldAge)) {
      const hex = findFootprintSite(settlement, 'temple', world.hexMap);
      if (hex) queueConstruction(settlement, hex, 'temple', tick, world.hexMap);
    }
    if (worldAge >= 2 && settlement.population > 12 && !settlementHasBuilding(settlement, 'barracks', true) &&
        isBuildingUnlocked('barracks', worldAge)) {
      const hex = findFootprintSite(settlement, 'barracks', world.hexMap);
      if (hex) queueConstruction(settlement, hex, 'barracks', tick, world.hexMap);
    }
    if (worldAge >= 2 && settlement.population > 18 && !settlementHasBuilding(settlement, 'guild_hall', true) &&
        isBuildingUnlocked('guild_hall', worldAge)) {
      const hex = findFootprintSite(settlement, 'guild_hall', world.hexMap);
      if (hex) queueConstruction(settlement, hex, 'guild_hall', tick, world.hexMap);
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
