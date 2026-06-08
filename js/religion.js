import { EVENT } from './events.js';

const FAITHS = [
  { id: 'solaris',  name: 'The Solaris Order',  god: 'Aetar',   symbol: '☀', tenet: 'Light & order',     color: '#f5c842' },
  { id: 'moonveil', name: 'Moonveil Covenant',  god: 'Luneth',  symbol: '🌙', tenet: 'Mystery & cycles',  color: '#a0c8e8' },
  { id: 'earthen',  name: 'The Earthen Circle', god: 'Grova',   symbol: '🌿', tenet: 'Nature & growth',   color: '#70c870' },
  { id: 'ironblood',name: 'Ironblood Cult',     god: 'Kragath', symbol: '⚒', tenet: 'Strength & war',    color: '#e04040' },
  { id: 'voidwhisper',name:'Voidwhisper Sect',  god: 'Nyr',     symbol: '🌑', tenet: 'Shadow & secrets',  color: '#7050a8' },
  { id: 'tidecaller',name:'Tidecaller Faith',   god: 'Seluun',  symbol: '🌊', tenet: 'Sea & fate',        color: '#4090d0' },
];

export function getFaith(id) {
  return FAITHS.find(f => f.id === id) || FAITHS[0];
}

export function getAllFaiths() { return FAITHS; }

export function initReligion(world, rng) {
  // Assign a starting faith to each settlement
  const shuffled = rng.shuffle([...FAITHS]);
  for (let i = 0; i < world.settlements.length; i++) {
    world.settlements[i].faith = shuffled[i % shuffled.length].id;
  }
}

export function tickReligion(world, agents, bus, tick, rng) {
  if (tick % 48 !== 0) return;

  for (const settlement of world.settlements) {
    const faith = getFaith(settlement.faith);
    const priests = agents.filter(a =>
      !a.dead && (a.job === 'priest' || a.job === 'mage') &&
      (a.settlementId === settlement.id || a.employerId === settlement.id)
    );

    // Priests spread faith to agents in the settlement
    const residents = agents.filter(a =>
      !a.dead && (a.settlementId === settlement.id || a.employerId === settlement.id)
    );
    for (const agent of residents) {
      if (!agent.faith && priests.length > 0 && rng.next() < 0.25) {
        agent.faith = settlement.faith;
      }
    }

    // Blessings from priests on devout settlement
    const devout = residents.filter(a => a.faith === settlement.faith).length;
    const ratio = residents.length > 0 ? devout / residents.length : 0;
    if (ratio > 0.6 && priests.length > 0) {
      // Bless residents: small health + need bonus
      for (const agent of residents.slice(0, 4)) {
        agent.health = Math.min(100, (agent.health || 80) + 3);
        if (agent.needs) agent.needs.safety = Math.min(100, (agent.needs.safety || 70) + 5);
      }
      settlement.blessed = true;
    } else {
      settlement.blessed = false;
    }

    // Holy war: if two neighboring settlements have incompatible faiths
    if (tick % 480 === 0 && rng.next() < 0.08) {
      const others = world.settlements.filter(s => s.id !== settlement.id && s.faith !== settlement.faith);
      if (others.length && settlement.kingdom && others[0].kingdom !== settlement.kingdom) {
        const rival = others[Math.floor(rng.next() * others.length)];
        _pushEvent(settlement, `Holy war declared against ${rival.name} (${getFaith(rival.faith).name})`, tick);
        _pushEvent(rival, `${settlement.name} declared holy war! (${faith.name})`, tick);
        bus.emit(EVENT.WAR_START, { aggressor: { name: settlement.name }, defender: { name: rival.name }, tick });
      }
    }

    // Spreading faith between neighboring settlements (slow)
    if (tick % 720 === 0 && rng.next() < 0.1 && priests.length > 0) {
      const nearby = world.settlements.filter(s => s.id !== settlement.id);
      if (nearby.length) {
        const target = nearby[Math.floor(rng.next() * nearby.length)];
        if (target.faith !== settlement.faith) {
          target.faith = settlement.faith;
          _pushEvent(target, `The ${faith.name} has spread to ${target.name}`, tick);
        }
      }
    }
  }
}

function _pushEvent(settlement, text, tick) {
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}
