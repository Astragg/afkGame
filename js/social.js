import { EVENT } from './events.js';
import { createSkills } from './skills.js';
import { createWallet, creditWallet, walletTotal } from './currency.js';
import { assignAgentHome } from './construction.js';
import { generateName, generatePersonality } from './races.js';
import { hexKey } from './hex.js';
import { RNG } from './rng.js';

export const MAX_POPULATION = 850;

export function tickSocial(agents, bus, tick, rng, world) {
  for (const agent of agents) {
    if (agent.dead || agent.age < 16) continue;
    decayRelationships(agent);
    if (agent.pregnant) {
      agent.pregnancyTicks = (agent.pregnancyTicks || 0) - 1;
      if (agent.pregnancyTicks <= 0) {
        const partner = agents.find(a => a.id === agent.partnerId);
        spawnChild(agent, partner, agents, bus, tick, rng, world);
        agent.pregnant = false;
      }
    }
  }
  attemptRomance(agents, rng, tick);
}

function decayRelationships(agent) {
  for (const rel of agent.relationships || []) {
    if (rel.type === 'rivalry') rel.affinity = Math.max(-100, rel.affinity - 0.1);
  }
}

function attemptRomance(agents, rng, tick) {
  if (tick % 6 !== 0) return;
  const eligible = agents.filter(a => !a.dead && !a.partnerId && a.age >= 18 && a.age < 60 && !a.imprisoned);
  if (eligible.length < 2) return;
  const livingCount = agents.reduce((n, x) => n + (x.dead ? 0 : 1), 0);
  const canReproduce = livingCount < MAX_POPULATION;

  // court several hopefuls per tick so families actually form
  const attempts = Math.min(8, Math.ceil(eligible.length / 12));
  for (let k = 0; k < attempts; k++) {
    const a = rng.pick(eligible);
    if (a.partnerId) continue;
    const nearby = eligible.filter(b =>
      b.id !== a.id && !b.partnerId && b.sex !== a.sex &&
      b.settlementId === a.settlementId &&
      Math.abs(a.q - b.q) + Math.abs(a.r - b.r) <= 3
    );
    if (!nearby.length) continue;
    const b = rng.pick(nearby);
    const relA = getOrCreateRelationship(a, b);
    const relB = getOrCreateRelationship(b, a);
    relA.affinity = Math.min(100, relA.affinity + 8 + rng.int(0, 8));
    relB.affinity = relA.affinity;

    if (relA.affinity > 55 && rng.next() < 0.25) {
      marry(a, b, relA, relB, tick);
      tryConceive(a, b, canReproduce);
    } else if (relA.affinity > 35) {
      tryConceive(a, b, canReproduce && rng.next() < 0.18);
    }
  }
}

function tryConceive(a, b, allowed) {
  if (!allowed) return;
  if (a.age >= 45 && b.age >= 45) return;
  const mother = a.sex === 'female' ? a : b.sex === 'female' ? b : null;
  const father = mother === a ? b : a;
  if (!mother || mother.pregnant || mother.age >= 45) return;
  mother.pregnant = true;
  mother.pregnancyTicks = 180;
  mother.partnerId = father.id;
}

export function marry(a, b, relA, relB, tick) {
  a.partnerId = b.id;
  b.partnerId = a.id;
  relA.type = 'spouse';
  relB.type = 'spouse';
  relA.affinity = 80;
  relB.affinity = 80;
  a.addEvent(tick, `Married ${b.name}`);
  b.addEvent(tick, `Married ${a.name}`);
}

export function getOrCreateRelationship(agent, other) {
  agent.relationships = agent.relationships || [];
  let rel = agent.relationships.find(r => r.agentId === other.id);
  if (!rel) {
    rel = { agentId: other.id, name: other.name, type: 'acquaintance', affinity: 20, trust: 50 };
    agent.relationships.push(rel);
  }
  return rel;
}

export function spawnChild(mother, father, agents, bus, tick, rng, world) {
  const race = rng.pick([mother.race, father?.race || mother.race]);
  const sex = rng.next() < 0.5 ? 'male' : 'female';
  const child = createAgentFromParents(mother, father, race, sex, rng, tick);
  agents.push(child);
  mother.addEvent(tick, `Gave birth to ${child.name}`);
  if (father) father.addEvent(tick, `Child born: ${child.name}`);
  getOrCreateRelationship(mother, child).type = 'child';
  getOrCreateRelationship(child, mother).type = 'parent';
  if (father) {
    getOrCreateRelationship(father, child).type = 'child';
    getOrCreateRelationship(child, father).type = 'parent';
  }
  const settlement = world?.settlements?.find(s => s.id === mother.settlementId);
  if (settlement && world) assignAgentHome(child, settlement, world);
  bus.emit(EVENT.BIRTH, { child: child.id, mother: mother.id, father: father?.id, tick });
  return child;
}

function createAgentFromParents(mother, father, race, sex, rng, tick) {
  return {
    id: `agent_${tick}_${rng.int(10000, 99999)}`,
    name: generateName(rng, race),
    race, sex, age: 0,
    q: mother.q, r: mother.r,
    homeQ: mother.homeQ, homeR: mother.homeR,
    settlementId: mother.settlementId,
    portraitSeed: rng.int(0, 9999),
    personality: generatePersonality(rng),
    needs: { hunger: 80, rest: 80, safety: 70, social: 60, esteem: 50, fun: 60 },
    skills: createSkills(race),
    memory: [],
    relationships: [],
    eventLog: [{ tick, text: 'Born' }],
    job: null,
    gold: 0,
    wallet: createWallet(0, 0, 0, 0, 0),
    hasHome: false,
    homeless: true,
    inventory: [],
    health: 100,
    mana: 50,
    legalStatus: 'free',
    imprisoned: false,
    dead: false,
    crowned: false,
    parentIds: [mother.id, father?.id].filter(Boolean),
    currentAction: 'idle',
    path: null,
    pathIndex: 0,
    addEvent(tick, text) {
      this.eventLog.push({ tick, text });
      if (this.eventLog.length > 50) this.eventLog.shift();
    },
  };
}

export function handleDeath(agent, agents, tick, world, guilds) {
  // inheritance to a living child
  const heirs = agents.filter(a => !a.dead && agent.relationships?.some(r => r.agentId === a.id && r.type === 'child'));
  if (heirs.length) {
    const heir = heirs[0];
    heir.wallet = heir.wallet || createWallet(0, 0, 0, 0, 0);
    creditWallet(heir.wallet, walletTotal(agent.wallet || {}));
    for (const item of agent.inventory || []) heir.inventory.push(item);
    heir.addEvent(tick, `Inherited assets from ${agent.name}`);
  }
  agent.wallet = createWallet(0, 0, 0, 0, 0);
  agent.inventory = [];

  const settlement = world?.settlements?.find(s => s.id === agent.settlementId);
  if (settlement) {
    // free job slot
    if (agent.job) {
      const jobDef = settlement.jobs?.find(j => j.type === agent.job);
      if (jobDef) jobDef.filled = Math.max(0, jobDef.filled - 1);
    }
    // remove from prison records
    if (settlement.prisoners?.length) {
      settlement.prisoners = settlement.prisoners.filter(p => p.agentId !== agent.id);
    }
    // vacate home
    const home = world.hexMap?.get(hexKey(agent.homeQ, agent.homeR))?.building;
    if (home?.residents) home.residents = home.residents.filter(id => id !== agent.id);
  }
  // leave guild
  if (agent.guildId && guilds) {
    const guild = guilds.find(g => g.id === agent.guildId);
    if (guild?.members) guild.members = guild.members.filter(m => m.agentId !== agent.id);
  }
  // widow the partner
  if (agent.partnerId) {
    const partner = agents.find(a => a.id === agent.partnerId);
    if (partner && partner.partnerId === agent.id) {
      partner.partnerId = null;
      partner.addEvent?.(tick, `Lost their spouse ${agent.name}`);
    }
  }
  agent.job = null;
  agent.hasHome = false;
}
