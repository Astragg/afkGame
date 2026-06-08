import { RNG } from './rng.js';
import { findPath, hexKey, hexNeighbors, getMoveCost } from './hex.js';
import { RACE_LIST, RACES, generateName, generatePersonality } from './races.js';
import { createSkills, SKILL_BRANCHES, RACE_SKILL_DEPTH, addSkillXP } from './skills.js';
import { hireAgent, jobSuitability } from './economy.js?v=7';
import { executeConquer } from './kingdoms.js';
import { commitCrime } from './crime.js';
import { assignQuest } from './guilds.js';
import { hunt, fish } from './animals.js';
import { EVENT } from './events.js';
import { createWallet, creditWallet } from './currency.js';
import { assignAgentHome, agentAtHome } from './construction.js';

const ACTIONS = [
  'eat', 'sleep', 'work', 'steal', 'patrol', 'conquer', 'travel', 'socialize',
  'quest', 'farm', 'fish', 'hunt', 'adventure', 'idle',
];

export function spawnAgents(world, count, rng) {
  const agents = [];
  const landBySettlement = new Map();
  for (const hex of world.hexMap.values()) {
    if (hex.settlementId && hex.walkable) {
      if (!landBySettlement.has(hex.settlementId)) landBySettlement.set(hex.settlementId, []);
      landBySettlement.get(hex.settlementId).push(hex);
    }
  }

  for (let i = 0; i < count; i++) {
    const settlement = rng.pick(world.settlements);
    const tiles = landBySettlement.get(settlement.id) || [];
    if (!tiles.length) continue;
    const hex = rng.pick(tiles);
    const race = weightedRace(rng, i);
    const agent = createAgent(i, race, hex, settlement, rng);
    agents.push(agent);
    tryHire(agent, settlement);
    assignAgentHome(agent, settlement, world);
  }
  settlementPop(world, agents);
  return agents;
}

export function getAgentCountForWorld(settlements) {
  return Math.min(420, Math.max(160, settlements.length * 12));
}

function weightedRace(rng, i) {
  const weights = { Human: 40, Goblin: 15, Orc: 15, Elf: 15, Dwarf: 15 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (const [race, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return race;
  }
  return 'Human';
}

export function createAgent(index, race, hex, settlement, rng) {
  const sex = rng.next() < 0.5 ? 'male' : 'female';
  const agent = {
    id: `agent_${index}`,
    name: generateName(rng, race),
    race, sex,
    age: rng.int(16, 50),
    q: hex.q, r: hex.r,
    homeQ: hex.q, homeR: hex.r,
    settlementId: settlement?.id,
    portraitSeed: rng.int(0, 9999),
    personality: generatePersonality(rng),
    needs: { hunger: 70 + rng.int(0, 20), rest: 70 + rng.int(0, 20), safety: 60, social: 50, esteem: 50, fun: 50 },
    skills: createSkills(race),
    skillXP: {},
    memory: [],
    relationships: [],
    eventLog: [{ tick: 0, text: `Arrived in ${settlement?.name || 'the wilds'}` }],
    job: null,
    gold: 0,
    wallet: createWallet(rng.int(0, 2), rng.int(10, 80), rng.int(0, 99), rng.int(0, 1), 0),
    hasHome: false,
    homeless: false,
    inventory: rng.next() < 0.3 ? [{ type: 'bread', qty: 2 }] : [],
    health: 100,
    mana: 50,
    legalStatus: 'free',
    imprisoned: false,
    dead: false,
    crowned: false,
    currentAction: 'idle',
    path: null,
    pathIndex: 0,
    starvationTicks: 0,
    blessed: 0,
    cursed: 0,
    addEvent(tick, text) {
      this.eventLog.push({ tick, text });
      if (this.eventLog.length > 50) this.eventLog.shift();
      this.memory.push({ tick, text });
      if (this.memory.length > 20) this.memory.shift();
    },
  };
  if (agent.personality.includes('greedy')) creditWallet(agent.wallet, 20);
  grantStartingSkills(agent, race, rng);
  return agent;
}

function grantStartingSkills(agent, race, rng) {
  const branches = RACE_SKILL_DEPTH[race] || RACE_SKILL_DEPTH.Human;
  for (const branch of branches) {
    const skills = SKILL_BRANCHES[branch] || [];
    const pick = skills[rng.int(0, skills.length - 1)];
    const key = `${branch}.${pick}`;
    if (agent.skills[key] !== undefined) {
      agent.skills[key] = rng.int(1, 3);
    }
  }
}

function tryHire(agent, settlement) {
  const open = settlement.jobs.filter(j => j.filled < j.slots);
  open.sort((a, b) => jobSuitability(agent, b.type) - jobSuitability(agent, a.type));
  for (const jobDef of open) {
    if (jobSuitability(agent, jobDef.type) > -5) {
      hireAgent(agent, settlement, jobDef.type);
      return;
    }
  }
}

function settlementPop(world, agents) {
  for (const s of world.settlements) {
    s.population = agents.filter(a => a.settlementId === s.id && !a.dead).length;
  }
}

export function tickAgents(agents, world, guilds, bus, tick, timeOfDay, weather) {
  const weatherMod = weather === 'storm' ? 0.7 : weather === 'rain' ? 0.85 : weather === 'snow' ? 0.75 : 1;

  for (const agent of agents) {
    if (agent.dead || agent.imprisoned) continue;

    decayNeeds(agent, weather);
    checkStarvation(agent, bus, tick);

    if (agent.path?.length && agent.pathIndex < agent.path.length) {
      moveAlongPath(agent, world.hexMap, weatherMod);
      continue;
    }

    const action = chooseAction(agent, agents, world, guilds, timeOfDay);
    executeAction(agent, action, agents, world, guilds, bus, tick, timeOfDay);

    if (tick % 24 === 0) {
      agent.age += 1 / 365;
      checkOldAge(agent, bus, tick);
    }
    if (agent.blessed > 0) agent.blessed--;
    if (agent.cursed > 0) agent.cursed--;
  }
}

function checkOldAge(agent, bus, tick) {
  const lifespan = RACES[agent.race]?.lifespan || 80;
  if (agent.age < lifespan * 0.75) return;
  const over = (agent.age - lifespan * 0.75) / (lifespan * 0.25);
  const dailyChance = 0.0006 + over * over * 0.012;
  if (Math.random() < dailyChance || agent.age > lifespan * 1.15) {
    agent.dead = true;
    agent.causeOfDeath = 'old age';
    agent.addEvent(tick, `Died of old age at ${Math.floor(agent.age)}`);
    bus.emit(EVENT.DEATH, { agent: agent.id, cause: 'old_age', tick });
  }
}

function decayNeeds(agent, weather) {
  const n = agent.needs;
  n.hunger = Math.max(0, n.hunger - (weather === 'heatwave' ? 1.5 : 1));
  n.rest = Math.max(0, n.rest - 0.5);
  n.social = Math.max(0, n.social - 0.3);
  n.fun = Math.max(0, n.fun - 0.4);
  n.safety = Math.max(0, n.safety - 0.1);
  if (agent.cursed > 0) { n.hunger -= 0.5; n.rest -= 0.5; }
  if (agent.blessed > 0) { n.hunger = Math.min(100, n.hunger + 0.3); }
}

function checkStarvation(agent, bus, tick) {
  if (agent.needs.hunger > 0) {
    agent.starvationTicks = 0;
    return;
  }
  agent.starvationTicks = (agent.starvationTicks || 0) + 1;
  if (agent.starvationTicks > 48) {
    agent.health -= 5;
  }
  if (agent.starvationTicks > 120 || agent.health <= 0) {
    agent.dead = true;
    agent.addEvent(tick, 'Died of starvation');
    bus.emit(EVENT.DEATH, { agent: agent.id, cause: 'starvation', tick });
  }
}

function chooseAction(agent, agents, world, guilds, timeOfDay) {
  const scores = {};
  const isNight = timeOfDay < 6 || timeOfDay > 21;
  const greedy = agent.personality.includes('greedy');
  const brave = agent.personality.includes('brave');
  const lazy = agent.personality.includes('lazy');
  const onDuty = agent.job === 'guard' && isNight;

  for (const action of ACTIONS) {
    let score = 0;
    switch (action) {
      case 'eat':
        score = (100 - agent.needs.hunger) * 2;
        if (agent.needs.hunger < 30) score += 50;
        break;
      case 'sleep':
        score = isNight ? (100 - agent.needs.rest) * 2 + 50 : (100 - agent.needs.rest);
        if (isNight && !onDuty) score += 80;
        if (agent.needs.rest < 35) score += 30;
        break;
      case 'work':
        if (isNight && !onDuty) score = 0;
        else score = agent.job ? (lazy ? 15 : 55) + agent.needs.esteem * 0.3 : 0;
        break;
      case 'steal':
        score = greedy ? 40 + (100 - agent.needs.hunger) : 5;
        if (agent.job === 'thief') score += 30;
        if (isNight) score += 15;
        score += (agent.skills?.['crime.stealth'] || 0) * 3;
        break;
      case 'patrol':
        score = agent.job === 'guard' ? (isNight ? 85 : 55) : 0;
        break;
      case 'conquer':
        score = (agent.job === 'guard' || agent.job === 'noble') ? 35 + (agent.skills?.['leadership.command'] || 0) * 6 : 0;
        if (brave) score += 20;
        if (isNight) score *= 0.2;
        break;
      case 'socialize':
        score = (100 - agent.needs.social) * 0.8;
        break;
      case 'quest':
        score = agent.guildId ? 50 + (agent.needs.esteem * 0.2) : 0;
        break;
      case 'hunt':
        score = (100 - agent.needs.hunger) * 0.5 + (agent.skills?.['survival.hunt'] || 0) * 2;
        break;
      case 'fish':
        score = agent.job === 'fisher' ? 55 : (agent.skills?.['survival.fish'] || 0) * 3;
        break;
      case 'adventure':
        score = brave ? 45 : 15;
        if (agent.guildId) score += 20;
        break;
      case 'travel':
        score = agent.path ? 10 : 5;
        break;
      case 'idle':
        score = lazy ? 30 : 5;
        break;
    }
    score *= 1 + (Math.random() - 0.5) * 0.2;
    if (agent.cursed > 0 && action === 'steal') score += 20;
    scores[action] = score;
  }

  let best = 'idle', bestScore = -1;
  for (const [action, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best;
}

function executeAction(agent, action, agents, world, guilds, bus, tick, timeOfDay) {
  agent.currentAction = action;
  const settlement = world.settlements.find(s => s.id === agent.settlementId);
  const hex = world.hexMap.get(hexKey(agent.q, agent.r));

  switch (action) {
    case 'eat':
      if (eat(agent, settlement)) break;
      pathTo(agent, { q: agent.homeQ, r: agent.homeR }, world.hexMap);
      break;
    case 'sleep': {
      const isNight = timeOfDay < 6 || timeOfDay > 21;
      if (isNight || agent.needs.rest < 45) {
        const atHome = agentAtHome(agent, world);
        const inWilderness = !agent.hasHome || !atHome;
        const restGain = atHome ? (isNight ? 22 : 14) : inWilderness ? (isNight ? 8 : 5) : 10;
        agent.needs.rest = Math.min(100, agent.needs.rest + restGain);
        if (inWilderness) {
          agent.needs.safety = Math.max(0, agent.needs.safety - (isNight ? 4 : 2));
          agent.currentAction = 'sleep_wild';
          if (tick % 24 === 0) agent.addEvent(tick, 'Slept under the open sky');
        } else {
          agent.currentAction = isNight ? 'sleep' : 'rest';
        }
        if (isNight && agent.job === 'mage') addSkillXP(agent, 'magic', 'illusion', 5);
      }
      if (agent.hasHome && (timeOfDay < 6 || timeOfDay > 20)) {
        pathTo(agent, { q: agent.homeQ, r: agent.homeR }, world.hexMap);
      } else if (!agent.hasHome && Math.random() < 0.1) wander(agent, world.hexMap);
      break;
    }
    case 'work':
      if (settlement && agent.job) {
        agent.needs.esteem = Math.min(100, agent.needs.esteem + 2);
        if (agent.job === 'guard') patrol(agent, world.hexMap);
      }
      break;
    case 'steal':
      if (settlement && agent.needs.hunger < 50) {
        const victim = agents.find(a => a.id !== agent.id && a.settlementId === agent.settlementId && !a.dead);
        if (victim && hexDistance(agent, victim) <= 2) {
          commitCrime(agent, 'theft', victim, agents, world, bus, tick, timeOfDay);
          creditWallet(agent.wallet, 5 + Math.floor(Math.random() * 15));
          agent.needs.hunger = Math.min(100, agent.needs.hunger + 20);
        }
      }
      break;
    case 'patrol':
      patrol(agent, world.hexMap);
      break;
    case 'conquer':
      if (settlement) executeConquer(agent, settlement, world, bus, tick);
      else wander(agent, world.hexMap);
      break;
    case 'socialize':
      const other = agents.find(a => a.id !== agent.id && a.settlementId === agent.settlementId && hexDistance(agent, a) <= 2);
      if (other) {
        agent.needs.social = Math.min(100, agent.needs.social + 15);
        agent.needs.fun = Math.min(100, agent.needs.fun + 10);
      } else {
        wander(agent, world.hexMap);
      }
      break;
    case 'quest': {
      const guild = guilds?.find(g => g.id === agent.guildId);
      if (guild && !agent.activeQuest) assignQuest(agent, guild);
      break;
    }
    case 'hunt':
      if (hex) {
        const result = hunt(agent, hex, world.animals || []);
        if (result) {
          agent.needs.hunger = Math.min(100, agent.needs.hunger + 15);
          agent.addEvent(tick, `Hunted ${result.prey}`);
        } else wander(agent, world.hexMap);
      }
      break;
    case 'fish':
      if (hex) {
        const result = fish(agent, hex);
        if (result) agent.needs.hunger = Math.min(100, agent.needs.hunger + 10);
        else {
          const water = findWaterHex(agent, world.hexMap);
          if (water) pathTo(agent, water, world.hexMap);
        }
      }
      break;
    case 'adventure': {
      const dungeon = world.dungeons?.find(d => hexDistance(agent, d.hex) > 2);
      if (dungeon) pathTo(agent, dungeon.hex, world.hexMap);
      break;
    }
    default:
      if (Math.random() < 0.1) wander(agent, world.hexMap);
  }
}

function eat(agent, settlement) {
  for (const item of agent.inventory) {
    if (['bread', 'fish', 'meat', 'food'].includes(item.type) && item.qty > 0) {
      item.qty--;
      agent.needs.hunger = Math.min(100, agent.needs.hunger + 25);
      if (item.qty <= 0) agent.inventory = agent.inventory.filter(i => i.qty > 0);
      return true;
    }
  }
  if (settlement && settlement.foodStore > 2) {
    settlement.foodStore -= 2;
    agent.needs.hunger = Math.min(100, agent.needs.hunger + 20);
    return true;
  }
  return false;
}

function pathTo(agent, goal, hexMap) {
  const canSwim = (agent.skills?.['survival.swim'] || 0) >= 2;
  const path = findPath({ q: agent.q, r: agent.r }, goal, hexMap, { canSwim });
  if (path?.length > 1) {
    agent.path = path;
    agent.pathIndex = 1;
  }
}

function moveAlongPath(agent, hexMap, weatherMod) {
  const next = agent.path[agent.pathIndex];
  const tile = hexMap.get(hexKey(next.q, next.r));
  if (!tile) { agent.path = null; return; }
  const from = hexMap.get(hexKey(agent.q, agent.r));
  const cost = getMoveCost(from, tile, { canSwim: (agent.skills?.['survival.swim'] || 0) >= 2 });
  if (cost >= Infinity) { agent.path = null; return; }
  agent.q = next.q;
  agent.r = next.r;
  agent.pathIndex++;
  if (agent.pathIndex >= agent.path.length) agent.path = null;
}

function patrol(agent, hexMap) {
  const neighbors = hexNeighbors(agent.q, agent.r).filter(n => hexMap.has(hexKey(n.q, n.r)));
  if (neighbors.length) {
    const n = neighbors[Math.floor(Math.random() * neighbors.length)];
    agent.q = n.q;
    agent.r = n.r;
  }
}

function wander(agent, hexMap) {
  const neighbors = hexNeighbors(agent.q, agent.r).filter(n => {
    const t = hexMap.get(hexKey(n.q, n.r));
    return t?.walkable;
  });
  if (neighbors.length) {
    const n = neighbors[Math.floor(Math.random() * neighbors.length)];
    agent.q = n.q;
    agent.r = n.r;
  }
}

function findWaterHex(agent, hexMap) {
  for (const n of hexNeighbors(agent.q, agent.r)) {
    const t = hexMap.get(hexKey(n.q, n.r));
    if (t && t.waterDepth > 0.3) return n;
  }
  return null;
}

function hexDistance(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r, ds = -dq - dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}
