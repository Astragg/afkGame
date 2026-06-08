import { EVENT } from './events.js';

/** Fantasy anime era progression — world evolves from wilderness to mythic fantasy */
export const AGES = [
  {
    id: 0, key: 'wilderness', name: 'Age of Wilderness', icon: '🌿',
    desc: 'Scattered survivors claw out a living in the wild.',
    tint: 'rgba(30,50,30,0.04)',
    unlock: () => true,
    buildings: ['home', 'farm'],
    jobs: ['farmer', 'fisher', 'hunter', 'herbalist'],
    flavor: 'The world is young. No guilds, no kings — only hunger and hope.',
  },
  {
    id: 1, key: 'hearth', name: 'Age of Hearth', icon: '🔥',
    desc: 'Settlements form. Markets and granaries feed growing towns.',
    tint: 'rgba(80,50,20,0.05)',
    unlock: (w) => w.population >= 40 || w.day >= 20,
    buildings: ['home', 'farm', 'market', 'granary', 'tavern'],
    jobs: ['merchant', 'baker', 'brewer', 'clerk', 'innkeeper'],
    flavor: 'Smoke rises from hearths. Trade routes whisper between hamlets.',
  },
  {
    id: 2, key: 'guild', name: 'Guild Era', icon: '⚔',
    desc: 'Adventurer guilds rise — the classic fantasy guild hall age.',
    tint: 'rgba(60,40,90,0.06)',
    unlock: (w) => w.population >= 100 || w.guildHalls >= 1 || w.adventurers >= 4,
    buildings: ['guild_hall', 'barracks', 'blacksmith'],
    jobs: ['adventurer', 'guard', 'blacksmith', 'ranger', 'bard', 'courier'],
    flavor: 'Guild boards fill with quests. Swords are drawn. Dungeons await.',
  },
  {
    id: 3, key: 'realm', name: 'Age of Realms', icon: '👑',
    desc: 'Kingdoms crown rulers. Diplomacy, war, and noble houses clash.',
    tint: 'rgba(90,70,30,0.06)',
    unlock: (w) => w.population >= 180 || w.kingdoms >= 2 || w.towns >= 2,
    buildings: ['prison', 'temple'],
    jobs: ['noble', 'diplomat', 'warlord', 'taxcollector', 'executioner', 'watchman'],
    flavor: 'Banners fly over walled cities. Thrones are contested by blood and gold.',
  },
  {
    id: 4, key: 'arcane', name: 'Arcane Dawn', icon: '✨',
    desc: 'Magic awakens — mages, temples, and enchanted artifacts spread.',
    tint: 'rgba(50,30,120,0.07)',
    unlock: (w) => w.population >= 280 || w.mages >= 3 || w.temples >= 2,
    buildings: ['temple'],
    jobs: ['mage', 'priest', 'enchanter', 'alchemist', 'healer', 'scholar'],
    flavor: 'Arcane light spills from towers. The weave stirs. Spells reshape fate.',
  },
  {
    id: 5, key: 'heroic', name: 'Heroic Age', icon: '🌟',
    desc: 'Legends walk the earth. Artifacts, champions, and epic quests define the era.',
    tint: 'rgba(120,90,20,0.07)',
    unlock: (w) => w.population >= 380 || w.artifacts >= 1 || w.champions >= 2,
    buildings: ['guild_hall'],
    jobs: ['adventurer', 'assassin', 'spy', 'chronicler', 'architect'],
    flavor: 'Names are sung in taverns. Heroes duel dragons. Destiny calls.',
  },
  {
    id: 6, key: 'mythic', name: 'Mythic Era', icon: '🐉',
    desc: 'Empires unite. Holy wars, shadow beasts, and world-shaping power.',
    tint: 'rgba(140,40,80,0.08)',
    unlock: (w) => w.population >= 480 || w.unifiedKingdoms >= 1 || w.day >= 300,
    buildings: ['temple', 'barracks', 'guild_hall'],
    jobs: ['mage', 'warlord', 'enchanter', 'noble', 'diplomat'],
    flavor: 'The world trembles. Empires rise and fall like tides. Myth becomes history.',
  },
];

export function initAges(world) {
  world.age = 0;
  world.ageName = AGES[0].name;
  world.ageUnlocked = [0];
}

export function getAge(id) {
  return AGES[id] || AGES[0];
}

export function getAgeTint(age) {
  return getAge(age).tint;
}

export function getAgeLabel(age) {
  const a = getAge(age);
  return `${a.icon} ${a.name}`;
}

function worldStats(world, agents, kingdoms, artifacts, guilds) {
  const living = agents.filter(a => !a.dead);
  const settlements = world.settlements || [];
  return {
    population: living.length,
    day: world._day || 0,
    guildHalls: settlements.reduce((n, s) => n + (s.buildings?.filter(b => b.type === 'guild_hall').length || 0), 0),
    adventurers: living.filter(a => a.job === 'adventurer').length,
    kingdoms: kingdoms?.length || 0,
    towns: settlements.filter(s => ['town', 'city', 'kingdom'].includes(s.tier)).length,
    mages: living.filter(a => ['mage', 'enchanter', 'priest'].includes(a.job)).length,
    temples: settlements.reduce((n, s) => n + (s.buildings?.filter(b => b.type === 'temple').length || 0), 0),
    artifacts: artifacts?.length || 0,
    champions: living.filter(a => (a.fame || 0) >= 100).length,
    unifiedKingdoms: kingdoms?.filter(k => (k.settlementIds?.length || 0) >= 3).length || 0,
    guildMembers: guilds?.reduce((n, g) => n + (g.members?.length || 0), 0) || 0,
  };
}

export function tickAges(world, agents, kingdoms, artifacts, guilds, bus, tick, day) {
  if (tick % 48 !== 0) return;
  const stats = worldStats(world, agents, kingdoms, artifacts, guilds);
  stats.day = day || 0;

  let newAge = world.age || 0;
  for (const age of AGES) {
    if (age.unlock(stats)) newAge = Math.max(newAge, age.id);
  }

  if (newAge > (world.age || 0)) {
    const prev = world.age || 0;
    world.age = newAge;
    world.ageName = getAge(newAge).name;
    world.ageUnlocked = world.ageUnlocked || [0];
    for (let i = prev + 1; i <= newAge; i++) {
      if (!world.ageUnlocked.includes(i)) world.ageUnlocked.push(i);
    }
    const ageDef = getAge(newAge);
    bus.emit(EVENT.AGE_ADVANCE, { from: prev, to: newAge, age: ageDef, tick });
    for (const settlement of world.settlements) {
      _applyAgeToSettlement(settlement, newAge, tick);
    }
  }
}

function _applyAgeToSettlement(settlement, ageId, tick) {
  const age = getAge(ageId);
  settlement.age = ageId;
  settlement.ageFlavor = age.flavor;
  // Unlock era-appropriate job slots once
  settlement._ageJobsApplied = settlement._ageJobsApplied || [];
  if (settlement._ageJobsApplied.includes(ageId)) return;
  settlement._ageJobsApplied.push(ageId);

  const jobSlots = {
    2: [{ type: 'adventurer', slots: 2, filled: 0 }, { type: 'ranger', slots: 1, filled: 0 }],
    3: [{ type: 'noble', slots: 1, filled: 0 }, { type: 'diplomat', slots: 1, filled: 0 }],
    4: [{ type: 'mage', slots: 1, filled: 0 }, { type: 'enchanter', slots: 1, filled: 0 }],
    5: [{ type: 'adventurer', slots: 2, filled: 0 }, { type: 'chronicler', slots: 1, filled: 0 }],
    6: [{ type: 'warlord', slots: 1, filled: 0 }, { type: 'mage', slots: 1, filled: 0 }],
  };
  if (jobSlots[ageId]) settlement.jobs.push(...jobSlots[ageId]);

  settlement.events = settlement.events || [];
  settlement.events.unshift({ text: `${age.icon} Entered the ${age.name}!`, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}

export function isBuildingUnlocked(type, worldAge) {
  const age = getAge(worldAge || 0);
  // Cumulative: check all ages up to current
  for (let i = 0; i <= (worldAge || 0); i++) {
    const a = getAge(i);
    if (a.buildings.includes(type)) return true;
  }
  // town_center and home always allowed
  return ['home', 'town_center', 'farm', 'granary'].includes(type);
}

export function isJobUnlocked(jobType, worldAge) {
  for (let i = 0; i <= (worldAge || 0); i++) {
    if (getAge(i).jobs.includes(jobType)) return true;
  }
  // baseline jobs from wilderness
  return ['farmer', 'fisher', 'hunter', 'guard', 'clerk', 'merchant', 'blacksmith'].includes(jobType);
}
