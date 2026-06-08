import { EVENT } from './events.js';

const DISEASES = [
  { id: 'fever',       name: 'Marsh Fever',      spreadChance: 0.12, damage: 2,  duration: 72,  symbol: '🤒', fatal: false },
  { id: 'plague',      name: 'Black Plague',     spreadChance: 0.22, damage: 5,  duration: 120, symbol: '💀', fatal: true  },
  { id: 'wasting',     name: 'Wasting Sickness', spreadChance: 0.07, damage: 1,  duration: 240, symbol: '😷', fatal: false },
  { id: 'red_pox',     name: 'Red Pox',          spreadChance: 0.18, damage: 3,  duration: 96,  symbol: '🔴', fatal: false },
  { id: 'cursed_rot',  name: 'Cursed Rot',       spreadChance: 0.08, damage: 4,  duration: 168, symbol: '🟢', fatal: true  },
];

export function getDisease(id) {
  return DISEASES.find(d => d.id === id);
}

export function tickDisease(agents, world, bus, tick, rng) {
  if (tick % 6 !== 0) return;

  // Group agents by hex
  const byHex = {};
  for (const agent of agents) {
    if (agent.dead) continue;
    const k = `${agent.q},${agent.r}`;
    if (!byHex[k]) byHex[k] = [];
    byHex[k].push(agent);
  }

  for (const agent of agents) {
    if (agent.dead) continue;

    // Progress existing disease
    if (agent.disease) {
      const def = getDisease(agent.disease.id);
      if (!def) { agent.disease = null; continue; }

      agent.disease.ticks = (agent.disease.ticks || 0) + 6;
      agent.health = Math.max(0, (agent.health || 80) - def.damage);

      // Healers/priests in same settlement provide partial immunity
      const settlement = world.settlements.find(s =>
        s.id === (agent.settlementId || agent.employerId)
      );
      const healers = settlement ? agents.filter(a =>
        !a.dead && !a.disease &&
        (a.job === 'healer' || a.job === 'priest' || a.job === 'herbalist') &&
        (a.settlementId === settlement.id || a.employerId === settlement.id)
      ).length : 0;
      const healMod = Math.min(0.8, healers * 0.15);

      // Recover
      if (agent.disease.ticks >= def.duration * (1 - healMod)) {
        agent.addEvent?.(tick, `Recovered from ${def.name}`);
        agent.disease = null;
        agent.immunity = agent.immunity || {};
        agent.immunity[def.id] = tick + 1440; // immune for 60 days
      }

      // Spread to nearby agents
      if (rng.next() < def.spreadChance * (1 - healMod * 0.5)) {
        const k = `${agent.q},${agent.r}`;
        const nearby = byHex[k] || [];
        for (const other of nearby) {
          if (other.id === agent.id || other.disease) continue;
          if (other.immunity?.[def.id] && other.immunity[def.id] > tick) continue;
          if (rng.next() < def.spreadChance) {
            other.disease = { id: def.id, ticks: 0 };
            other.addEvent?.(tick, `Contracted ${def.name} from ${agent.name}`);
          }
        }
      }
    }
  }

  // Spontaneous outbreak (rare)
  if (tick % 480 === 0) {
    for (const settlement of world.settlements) {
      if (rng.next() > 0.04) continue;
      const residents = agents.filter(a =>
        !a.dead && !a.disease &&
        (a.settlementId === settlement.id || a.employerId === settlement.id)
      );
      if (!residents.length) continue;
      const disease = rng.pick(DISEASES);
      const patient0 = residents[Math.floor(rng.next() * residents.length)];
      patient0.disease = { id: disease.id, ticks: 0 };
      _pushEvent(settlement, `${disease.symbol} Outbreak! ${disease.name} has appeared in ${settlement.name}`, tick);
      bus.emit(EVENT.DISASTER, { settlement, type: 'disease', disease: disease.name, tick });
    }
  }
}

function _pushEvent(settlement, text, tick) {
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}
