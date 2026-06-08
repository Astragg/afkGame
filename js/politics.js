import { EVENT } from './events.js';
import { creditWallet } from './currency.js';

const FACTIONS = [
  { id: 'militarist', label: 'Militarist',  bonus: 'guard_wage', color: '#e05050', icon: '⚔' },
  { id: 'merchant',   label: 'Merchant',    bonus: 'trade_rate', color: '#f0c030', icon: '💰' },
  { id: 'progressive',label: 'Progressive', bonus: 'birth_rate', color: '#50c878', icon: '🌱' },
  { id: 'noble',      label: 'Aristocracy', bonus: 'tax_rate',   color: '#9070d0', icon: '👑' },
  { id: 'theocracy',  label: 'Theocracy',   bonus: 'morale',     color: '#f0a030', icon: '✝' },
];

export function getFaction(id) {
  return FACTIONS.find(f => f.id === id) || FACTIONS[0];
}

export function initPolitics(world, rng) {
  for (const settlement of world.settlements) {
    settlement.faction = rng.pick(FACTIONS).id;
    settlement.corruptionLevel = Math.floor(rng.next() * 20); // 0-19
    settlement.electionCooldown = 0;
    settlement.politicalTension = 0;
  }
}

export function tickPolitics(world, agents, bus, tick, rng) {
  if (tick % 24 !== 0) return;

  for (const settlement of world.settlements) {
    const residents = agents.filter(a =>
      !a.dead && (a.settlementId === settlement.id || a.employerId === settlement.id)
    );
    if (!residents.length) continue;

    // Apply faction bonuses
    _applyFactionBonus(settlement, residents, agents, tick);

    // Corruption: nobles and taxcollectors may steal
    settlement.corruptionLevel = Math.max(0, Math.min(100, settlement.corruptionLevel || 0));
    if (tick % 96 === 0 && settlement.corruptionLevel > 30) {
      const nobles = residents.filter(a => a.job === 'noble' || a.job === 'taxcollector');
      if (nobles.length && rng.next() < settlement.corruptionLevel / 200) {
        const stolen = Math.floor(settlement.corruptionLevel * 0.5 + rng.next() * 20);
        const treasury = settlement.treasuryWallet || settlement;
        if ((treasury.silver || 0) >= stolen) {
          treasury.silver = (treasury.silver || 0) - stolen;
          const thief = nobles[Math.floor(rng.next() * nobles.length)];
          creditWallet(thief.wallet, stolen);
          thief.infamy = (thief.infamy || 0) + 5;
          _pushEvent(settlement, `Corruption! ${thief.name} embezzled ${stolen}s from the treasury`, tick);
          bus.emit(EVENT.CRIME, { agent: thief, settlement, type: 'corruption', tick });
        }
      }
    }

    // Tension: high unemployment, starvation, unpaid wages → rises
    const unemployed = residents.filter(a => !a.job).length;
    const unemploymentRate = unemployed / Math.max(1, residents.length);
    const hungry = residents.filter(a => (a.needs?.hunger || 100) < 20).length;
    settlement.politicalTension = Math.min(100,
      (settlement.politicalTension || 0)
      + unemploymentRate * 2
      + (hungry / Math.max(1, residents.length)) * 3
      - 0.5 // natural decay
    );

    // Election trigger
    settlement.electionCooldown = Math.max(0, (settlement.electionCooldown || 0) - 24);
    if (settlement.electionCooldown === 0 &&
        (settlement.politicalTension > 60 || tick % 2160 === 0)) {
      _runElection(settlement, residents, rng, bus, tick);
    }

    // Scandal event
    if (tick % 240 === 0 && rng.next() < 0.04 && settlement.corruptionLevel > 40) {
      const scandalTypes = [
        'treasury theft exposed', 'secret alliance revealed', 'affair with rival noble',
        'illegal trade uncovered', 'tax fraud discovered',
      ];
      const scandal = scandalTypes[Math.floor(rng.next() * scandalTypes.length)];
      _pushEvent(settlement, `Scandal in ${settlement.name}: ${scandal}!`, tick);
      settlement.politicalTension = Math.min(100, settlement.politicalTension + 15);
    }
  }
}

function _runElection(settlement, residents, rng, bus, tick) {
  // Count votes by faction preference (job-based)
  const votes = {};
  for (const f of FACTIONS) votes[f.id] = 0;
  for (const agent of residents) {
    const pref = _agentFactionPreference(agent);
    votes[pref] = (votes[pref] || 0) + 1 + rng.next() * 0.5;
  }
  const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  const oldFaction = settlement.faction;
  settlement.faction = winner;
  settlement.electionCooldown = 720; // 30 days before next election
  settlement.politicalTension = Math.max(0, settlement.politicalTension - 30);
  const fac = getFaction(winner);
  _pushEvent(settlement, `Election: ${fac.label} party won! (${fac.icon})`, tick);
  if (oldFaction !== winner) {
    bus.emit(EVENT.FACTION_CHANGE, { settlement, from: oldFaction, to: winner, tick });
  }
}

function _agentFactionPreference(agent) {
  const j = agent.job || '';
  if (['guard','warlord','ranger','executioner'].includes(j)) return 'militarist';
  if (['merchant','taxcollector','courier'].includes(j)) return 'merchant';
  if (['farmer','fisher','healer','herbalist'].includes(j)) return 'progressive';
  if (['noble','diplomat','scholar'].includes(j)) return 'noble';
  if (['priest','mage','enchanter'].includes(j)) return 'theocracy';
  return FACTIONS[Math.floor(Math.random() * FACTIONS.length)].id;
}

function _applyFactionBonus(settlement, residents, agents, tick) {
  if (tick % 96 !== 0) return;
  switch (settlement.faction) {
    case 'militarist':
      // Guards get bonus wage
      for (const a of residents.filter(r => r.job === 'guard' || r.job === 'warlord')) {
        creditWallet(a.wallet, 3);
      }
      break;
    case 'merchant':
      // +5% treasury income
      if (settlement.treasuryWallet) {
        settlement.treasuryWallet.silver = (settlement.treasuryWallet.silver || 0) + Math.floor(settlement.population * 0.3);
      }
      break;
    case 'progressive':
      // Residents get small need boosts
      for (const a of residents.slice(0, 5)) {
        if (a.needs) {
          a.needs.safety = Math.min(100, (a.needs.safety || 70) + 2);
          a.needs.social = Math.min(100, (a.needs.social || 70) + 2);
        }
      }
      break;
    case 'noble':
      // Nobles get bonus, peasants get nothing
      for (const a of residents.filter(r => r.socialClass === 'noble')) {
        creditWallet(a.wallet, 5);
      }
      settlement.corruptionLevel = Math.min(100, (settlement.corruptionLevel || 0) + 1);
      break;
    case 'theocracy':
      // Health bonus for faithful
      for (const a of residents.filter(r => r.faith === settlement.faith)) {
        a.health = Math.min(100, (a.health || 80) + 2);
      }
      break;
  }
}

function _pushEvent(settlement, text, tick) {
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}
