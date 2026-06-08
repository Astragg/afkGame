import { EVENT } from './events.js';
import { creditWallet } from './currency.js';

const ARTIFACT_PREFIXES = ['Ancient','Cursed','Blessed','Eternal','Shattered','Radiant','Shadowed','Void-touched','Dragon-forged','Elder'];
const ARTIFACT_NOUNS = ['Blade','Amulet','Crown','Tome','Staff','Ring','Shield','Gauntlet','Chalice','Orb','Rune','Idol'];
const ARTIFACT_BONUSES = [
  { key: 'combat.melee',    label: '+Combat',  value: 15 },
  { key: 'magic.elemental', label: '+Magic',   value: 15 },
  { key: 'leadership.govern',label: '+Govern', value: 15 },
  { key: 'survival.farm',   label: '+Farming', value: 15 },
  { key: 'craft.smith',     label: '+Crafting',value: 15 },
  { key: 'health_max',      label: '+Health',  value: 25 },
  { key: 'wage_mult',       label: '+Wages',   value: 0.3 },
];

function makeName(rng) {
  const pfx = rng.pick(ARTIFACT_PREFIXES);
  const noun = rng.pick(ARTIFACT_NOUNS);
  return `${pfx} ${noun}`;
}

export function initArtifacts() {
  return [];
}

export function tickArtifacts(artifacts, world, agents, bus, tick, rng) {
  if (tick % 120 !== 0) return;

  // Enchanters create artifacts
  for (const agent of agents) {
    if (agent.dead || agent.job !== 'enchanter') continue;
    const skill = agent.skills?.['magic.enchant'] || 0;
    if (rng.next() > 0.02 + skill * 0.003) continue;
    // Already holding an artifact?
    if (artifacts.some(a => a.holderId === agent.id)) continue;

    const bonus = rng.pick(ARTIFACT_BONUSES);
    const artifact = {
      id: `artifact_${tick}_${agent.id}`,
      name: makeName(rng),
      bonus: bonus.key,
      bonusLabel: bonus.label,
      bonusValue: bonus.value,
      creatorId: agent.id,
      holderId: agent.id,
      settlementId: agent.settlementId || agent.employerId,
      age: tick,
      contested: false,
    };
    artifacts.push(artifact);
    agent.addEvent?.(tick, `Crafted legendary artifact: ${artifact.name}`);
    agent.fame = (agent.fame || 0) + 30;
    const settlement = world.settlements.find(s => s.id === artifact.settlementId);
    if (settlement) {
      _pushEvent(settlement, `${agent.name} created the legendary ${artifact.name}!`, tick);
      bus.emit(EVENT.ARTIFACT_CREATED, { agent, artifact, settlement, tick });
    }
  }

  // Apply artifact bonuses to holders
  for (const artifact of artifacts) {
    if (!artifact.holderId) continue;
    const holder = agents.find(a => a.id === artifact.holderId && !a.dead);
    if (!holder) { artifact.holderId = null; continue; }
    const [cat, sub] = artifact.bonus.split('.');
    if (sub && holder.skills) {
      const k = artifact.bonus;
      holder.skills[k] = Math.min(50, (holder.skills[k] || 0) + 0.01);
    }
    if (artifact.bonus === 'health_max') {
      holder.health = Math.min(100 + artifact.bonusValue, (holder.health || 80) + 0.02);
    }
  }

  // Kingdoms contest artifacts
  if (tick % 720 === 0) {
    for (const artifact of artifacts) {
      if (!artifact.holderId || rng.next() > 0.08) continue;
      const holder = agents.find(a => a.id === artifact.holderId && !a.dead);
      if (!holder) continue;
      // Find a rival agent who wants to steal it
      const rivals = agents.filter(a =>
        !a.dead && a.id !== artifact.holderId &&
        (a.job === 'thief' || a.job === 'warlord' || a.job === 'noble') &&
        (a.skills?.['combat.melee'] || 0) > (holder.skills?.['combat.melee'] || 0)
      );
      if (!rivals.length) continue;
      const rival = rivals[Math.floor(rng.next() * rivals.length)];
      artifact.holderId = rival.id;
      artifact.settlementId = rival.settlementId || rival.employerId;
      rival.fame = (rival.fame || 0) + 20;
      rival.addEvent?.(tick, `Seized ${artifact.name} from ${holder.name}!`);
      holder.addEvent?.(tick, `Lost ${artifact.name} to ${rival.name}!`);
      artifact.contested = true;
    }
  }
}

function _pushEvent(settlement, text, tick) {
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}
