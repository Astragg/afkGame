import { EVENT } from './events.js';
import { payFromWallet, creditWallet } from './currency.js';
import { hexDistance } from './hex.js';

export const CRIME_TYPES = ['theft', 'assault', 'murder', 'trespass', 'smuggling', 'illegal_magic', 'bribery'];

export function tickCrime(agents, world, bus, tick, timeOfDay) {
  const crimes = [];
  for (const agent of agents) {
    if (agent.dead || agent.imprisoned) continue;
    if (agent.pendingCrime) {
      resolveCrime(agent, agents, world, bus, tick, timeOfDay);
    }
  }
  processTrials(agents, world, bus, tick);
  processPrisons(agents, world, bus, tick);
  return crimes;
}

export function commitCrime(agent, type, victim, agents = [], world, bus, tick, timeOfDay) {
  const isNight = timeOfDay < 6 || timeOfDay > 20;
  const detectionBase = isNight ? 0.3 : 0.6;
  const stealth = agent.skills?.['crime.stealth'] || 0;
  const guardNearby = findNearbyGuards(agent, agents) > 0;
  let detectChance = detectionBase - stealth * 0.05;
  if (guardNearby) detectChance += 0.3;
  if (Math.random() < detectChance) {
    const record = {
      id: `crime_${tick}_${agent.id}`,
      type,
      criminalId: agent.id,
      victimId: victim?.id,
      tick,
      detected: true,
      evidence: 0.5 + Math.random() * 0.3,
      witnesses: guardNearby ? 1 : 0,
    };
    agent.crimes = agent.crimes || [];
    agent.crimes.push(record);
    agent.legalStatus = 'wanted';
    agent.addEvent(tick, `Committed ${type} — detected!`);
    bus.emit(EVENT.CRIME, record);
    attemptArrest(agent, agents, world, bus, tick);
  } else {
    agent.addEvent(tick, `Committed ${type} — undetected`);
    bus.emit(EVENT.CRIME, { type, criminalId: agent.id, detected: false, tick });
  }
}

function findNearbyGuards(agent, agents) {
  return agents.filter(a =>
    !a.dead && a.job === 'guard' && !a.imprisoned &&
    hexDistance({ q: agent.q, r: agent.r }, { q: a.q, r: a.r }) <= 3
  ).length;
}

function attemptArrest(criminal, agents, world, bus, tick) {
  const guards = agents.filter(a =>
    a.job === 'guard' && !a.dead &&
    hexDistance({ q: a.q, r: a.r }, { q: criminal.q, r: criminal.r }) <= 4
  );
  if (!guards.length) return;
  const guard = guards[0];
  criminal.imprisoned = true;
  criminal.legalStatus = 'detained';
  criminal.addEvent(tick, `Arrested by ${guard.name}`);
  guard.addEvent(tick, `Arrested ${criminal.name}`);
  bus.emit(EVENT.ARREST, { criminal: criminal.id, guard: guard.id, tick });

  const settlement = world.settlements.find(s => s.id === criminal.settlementId);
  if (settlement) {
    settlement.prisoners = settlement.prisoners || [];
    settlement.prisoners.push({ agentId: criminal.id, sentence: 0, trialPending: true });
  }
}

function processTrials(agents, world, bus, tick) {
  for (const settlement of world.settlements) {
    for (const prisoner of (settlement.prisoners || [])) {
      if (!prisoner.trialPending) continue;
      const agent = agents.find(a => a.id === prisoner.agentId);
      if (!agent) continue;
      const result = conductTrial(agent, agents, settlement, tick);
      prisoner.trialPending = false;
      prisoner.originalSentence = result.sentence;
      prisoner.sentence = result.sentence === 'prison' ? 72 : result.sentence === 'fine' ? 12 : result.sentence === 'execution' ? 1 : 0;
      bus.emit(EVENT.TRIAL, { agent: agent.id, guilty: result.guilty, sentence: result.sentence, tick });
      agent.addEvent(tick, `Trial: ${result.guilty ? 'GUILTY' : 'NOT GUILTY'} — ${result.sentence}`);
      if (!result.guilty) {
        agent.imprisoned = false;
        agent.legalStatus = 'free';
      } else {
        agent.legalStatus = 'convicted';
      }
    }
  }
}

function conductTrial(defendant, agents, settlement, tick) {
  const crimes = defendant.crimes?.filter(c => c.detected) || [];
  const evidence = crimes.reduce((s, c) => s + c.evidence, 0) / Math.max(1, crimes.length);
  const prosecutorSkill = (agents.find(a => a.job === 'guard')?.skills?.['law.prosecute'] || 0) * 0.05;
  const defenderSkill = (defendant.skills?.['law.defend'] || 0) * 0.08;
  const judgeSkill = 0.5;
  const corruption = Math.random() < 0.1 ? 0.3 : 0;
  const guiltyChance = evidence + prosecutorSkill - defenderSkill + judgeSkill - corruption;
  const guilty = Math.random() < guiltyChance;
  const sentence = guilty ? (crimes.some(c => c.type === 'murder') ? 'execution' :
    crimes.some(c => c.type === 'theft') ? 'prison' : 'fine') : 'acquitted';
  return { guilty, sentence };
}

function processPrisons(agents, world, bus, tick) {
  for (const settlement of world.settlements) {
    if (!settlement.prisoners?.length) continue;
    for (const prisoner of settlement.prisoners) {
      if (prisoner.trialPending || prisoner.done) continue;
      const agent = agents.find(a => a.id === prisoner.agentId);
      if (!agent || agent.dead) { prisoner.done = true; continue; }

      prisoner.sentence = (prisoner.sentence || 0) - 1;
      settlement.foodStore = Math.max(0, settlement.foodStore - 0.5);

      // chance to escape
      if (Math.random() < 0.02) {
        agent.imprisoned = false;
        agent.legalStatus = 'fugitive';
        agent.crimes = [];
        agent.addEvent(tick, 'Escaped from prison!');
        prisoner.done = true;
        continue;
      }

      if (prisoner.sentence > 0) continue;

      // sentence served / carried out
      if (prisoner.originalSentence === 'execution') {
        agent.dead = true;
        agent.causeOfDeath = 'execution';
        agent.addEvent(tick, 'Executed for their crimes');
        bus.emit(EVENT.DEATH, { agent: agent.id, cause: 'execution', tick });
      } else {
        if (prisoner.originalSentence === 'fine') {
          payFromWallet(agent.wallet || { gold: 0, silver: 0, copper: 0, gems: 0, tokens: 0 }, 50);
        }
        agent.imprisoned = false;
        agent.legalStatus = 'free';
        agent.crimes = [];
        agent.addEvent(tick, 'Released from prison');
      }
      prisoner.done = true;
    }
    // drop finished prisoners so the array never grows unbounded
    settlement.prisoners = settlement.prisoners.filter(p => !p.done);
  }
}

function resolveCrime(agent, agents, world, bus, tick, timeOfDay) {
  commitCrime(agent, agent.pendingCrime, agent.crimeTarget, agents, world, bus, tick, timeOfDay);
  agent.pendingCrime = null;
  agent.crimeTarget = null;
}

export function pardonAgent(agent, world) {
  agent.imprisoned = false;
  agent.legalStatus = 'free';
  agent.crimes = [];
  const settlement = world.settlements.find(s => s.id === agent.settlementId);
  if (settlement?.prisoners) {
    settlement.prisoners = settlement.prisoners.filter(p => p.agentId !== agent.id);
  }
  return true;
}
