import { EVENT } from './events.js';
import { createSkills } from './skills.js';
import { createWallet, creditWallet, walletTotal } from './currency.js';
import { assignAgentHome } from './construction.js';
import { generateName, generatePersonality, getRacialTension } from './races.js';
import { hexKey } from './hex.js';
import { RNG } from './rng.js';

export const MAX_POPULATION = 850;

export function tickSocial(agents, bus, tick, rng, world, season) {
  const birthMult = season ? (season === 'spring' ? 1.4 : season === 'winter' ? 0.55 : 1.0) : 1.0;
  for (const agent of agents) {
    if (agent.dead || agent.age < 16) continue;
    decayRelationships(agent);
    updateSocialClass(agent);
    if (agent.pregnant) {
      agent.pregnancyTicks = (agent.pregnancyTicks || 0) - 1;
      if (agent.pregnancyTicks <= 0) {
        const partner = agents.find(a => a.id === agent.partnerId);
        spawnChild(agent, partner, agents, bus, tick, rng, world);
        agent.pregnant = false;
      }
    }
  }
  attemptRomance(agents, rng, tick, birthMult);
  tickRevolts(agents, world, bus, tick, rng);
  tickSuccession(agents, world, bus, tick, rng);
  if (tick % 480 === 0) tickRacialTensions(agents, world, bus, tick, rng);
}

function decayRelationships(agent) {
  for (const rel of agent.relationships || []) {
    if (rel.type === 'rivalry') rel.affinity = Math.max(-100, rel.affinity - 0.1);
  }
}

function updateSocialClass(agent) {
  const wealth = (agent.wallet?.gold || 0) * 100 + (agent.wallet?.silver || 0);
  if (agent.job === 'noble' || agent.crowned) {
    agent.socialClass = 'noble';
  } else if (wealth > 500 || agent.job === 'merchant' || agent.job === 'blacksmith') {
    agent.socialClass = agent.socialClass === 'noble' ? 'noble' : 'merchant';
  } else {
    agent.socialClass = agent.socialClass === 'noble' ? 'noble' : (agent.socialClass === 'merchant' ? 'merchant' : 'peasant');
  }
}

function tickRevolts(agents, world, bus, tick, rng) {
  if (tick % 48 !== 0) return;
  for (const settlement of world.settlements) {
    const residents = agents.filter(a => !a.dead && a.settlementId === settlement.id);
    const peasants = residents.filter(a => a.socialClass === 'peasant' || !a.socialClass);
    if (peasants.length < 5) continue;
    const avgHunger = peasants.reduce((s, a) => s + (a.needs?.hunger ?? 80), 0) / peasants.length;
    const avgSafety = peasants.reduce((s, a) => s + (a.needs?.safety ?? 70), 0) / peasants.length;
    const tension = (100 - avgHunger) * 0.4 + (100 - avgSafety) * 0.3 + (settlement.unemployment || 0) * 2;
    if (tension > 60 && rng.next() < 0.08) {
      const ringleader = rng.pick(peasants);
      ringleader.addEvent(tick, `Led a peasant revolt in ${settlement.name}!`);
      for (const p of peasants.slice(0, Math.floor(peasants.length * 0.3))) {
        p.needs.safety = Math.min(100, (p.needs.safety || 70) + 20);
        p.needs.esteem = Math.min(100, (p.needs.esteem || 50) + 15);
      }
      settlement.foodStore = (settlement.foodStore || 0) + Math.floor(settlement.foodStore * 0.05);
      _pushEvent(settlement, `⚡ Peasant revolt! ${ringleader.name} led the uprising`, tick);
      bus.emit('revolt', { settlement: settlement.id, leader: ringleader.id, tension: Math.floor(tension), tick });
    }
  }
}

function tickSuccession(agents, world, bus, tick, rng) {
  if (tick % 24 !== 0) return;
  for (const settlement of world.settlements) {
    if (!settlement.rulerId) continue;
    const ruler = agents.find(a => a.id === settlement.rulerId);
    if (ruler && !ruler.dead) {
      // Update dynasty name
      if (!ruler.dynastyName) ruler.dynastyName = `House ${ruler.name.split(' ')[1] || ruler.name}`;
      settlement.dynastyName = ruler.dynastyName;
      // Designate heir
      if (!settlement.heirId) {
        const children = agents.filter(a =>
          !a.dead && a.parentIds?.includes(ruler.id) && a.age >= 16
        );
        if (children.length) {
          settlement.heirId = (children.find(c => c.job === 'noble') || children[0]).id;
          settlement.heirName = agents.find(a => a.id === settlement.heirId)?.name;
        }
      }
      continue;
    }
    // Ruler is dead — succession
    _doSuccession(settlement, agents, world, bus, tick, rng);
  }
}

function _doSuccession(settlement, agents, world, bus, tick, rng) {
  const heir = settlement.heirId ? agents.find(a => a.id === settlement.heirId && !a.dead) : null;
  if (heir) {
    heir.job = 'noble';
    heir.socialClass = 'noble';
    settlement.rulerId = heir.id;
    settlement.rulerName = heir.name;
    settlement.heirId = null;
    settlement.heirName = null;
    heir.addEvent(tick, `Ascended to rule ${settlement.name}`);
    _pushEvent(settlement, `👑 ${heir.name} inherits the throne`, tick);
    bus.emit('succession', { settlement: settlement.id, ruler: heir.id, type: 'peaceful', tick });
  } else {
    // Power struggle
    const candidates = agents.filter(a =>
      !a.dead && !a.imprisoned && a.settlementId === settlement.id &&
      (a.job === 'noble' || a.job === 'guard' || a.job === 'merchant') && a.age >= 20
    );
    if (candidates.length) {
      candidates.sort((a, b) => ruleContestScore(b) - ruleContestScore(a));
      const winner = candidates[0];
      winner.job = 'noble';
      winner.socialClass = 'noble';
      settlement.rulerId = winner.id;
      settlement.rulerName = winner.name;
      settlement.dynastyName = `House ${winner.name.split(' ').pop()}`;
      settlement.heirId = null;
      winner.addEvent(tick, `Seized power in ${settlement.name}`);
      _pushEvent(settlement, `⚔ ${winner.name} seized the throne in a power struggle`, tick);
      bus.emit('succession', { settlement: settlement.id, ruler: winner.id, type: 'contested', tick });
    } else {
      settlement.rulerId = null;
      settlement.rulerName = null;
      _pushEvent(settlement, `⚠ ${settlement.name} has no ruler — anarchy reigns`, tick);
    }
  }
}

function ruleContestScore(a) {
  return (a.skills?.['leadership.govern'] || 0) * 15 +
    (a.skills?.['combat.melee'] || 0) * 8 +
    (a.job === 'noble' ? 40 : a.job === 'guard' ? 20 : 10);
}

function _pushEvent(settlement, text, tick) {
  settlement.recentEvents = settlement.recentEvents || [];
  settlement.recentEvents.push({ tick, text });
  if (settlement.recentEvents.length > 12) settlement.recentEvents.shift();
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}

function attemptRomance(agents, rng, tick, birthMult = 1) {
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
      tryConceive(a, b, canReproduce, birthMult);
    } else if (relA.affinity > 35) {
      tryConceive(a, b, canReproduce && rng.next() < 0.18 * birthMult, birthMult);
    }
  }
}

function tryConceive(a, b, allowed, birthMult = 1) {
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

function tickRacialTensions(agents, world, bus, tick, rng) {
  for (const settlement of world.settlements) {
    const residents = agents.filter(a => !a.dead && (a.settlementId === settlement.id || a.employerId === settlement.id));
    // Check for racial pairs with tension
    const races = [...new Set(residents.map(a => a.race))];
    for (let i = 0; i < races.length; i++) {
      for (let j = i + 1; j < races.length; j++) {
        const tension = getRacialTension(races[i], races[j]);
        if (tension > 0 && rng.next() < tension * 0.15) {
          const groupA = residents.filter(a => a.race === races[i]);
          const groupB = residents.filter(a => a.race === races[j]);
          if (!groupA.length || !groupB.length) continue;
          const agentA = rng.pick(groupA);
          const agentB = rng.pick(groupB);
          agentA.infamy = (agentA.infamy || 0) + 3;
          agentB.infamy = (agentB.infamy || 0) + 3;
          agentA.health = Math.max(1, agentA.health - 5);
          agentB.health = Math.max(1, agentB.health - 5);
          _pushEvent(settlement, `Racial brawl: ${agentA.name} (${agentA.race}) vs ${agentB.name} (${agentB.race})`, tick);
        }
      }
    }
  }
}
