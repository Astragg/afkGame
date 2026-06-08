import { EVENT } from './events.js';
import { creditWallet } from './currency.js';
import { hexDistance } from './hex.js';

export function tickAdventuring(agents, world, dungeons, bus, tick) {
  const parties = findParties(agents);
  for (const party of parties) {
    if (party.leader.currentAction !== 'adventure') continue;
    const dungeon = dungeons.find(d =>
      hexDistance({ q: party.leader.q, r: party.leader.r }, d.hex) <= 1
    );
    if (!dungeon) continue;
    resolveDungeonLevel(party, dungeon, world, bus, tick);
  }
}

function findParties(agents) {
  const leaders = agents.filter(a => !a.dead && a.partyLeader);
  return leaders.map(leader => ({
    leader,
    members: agents.filter(a => a.partyId === leader.partyId && !a.dead),
  }));
}

export function formParty(leader, members) {
  const partyId = `party_${leader.id}`;
  leader.partyId = partyId;
  leader.partyLeader = true;
  for (const m of members.slice(0, 3)) {
    m.partyId = partyId;
  }
  return partyId;
}

function resolveDungeonLevel(party, dungeon, world, bus, tick) {
  const hex = world.hexMap.get(`${dungeon.hex.q},${dungeon.hex.r}`);
  if (!hex?.dungeon) return;
  const d = hex.dungeon;
  const power = party.members.reduce((s, a) =>
    s + (a.skills?.['combat.melee'] || 0) + (a.skills?.['combat.tactics'] || 0) + (a.health || 100) / 20, 0
  );
  const difficulty = (d.depth - d.cleared) * 5 + 10;
  const roll = power + (Math.random() - 0.5) * 10;

  if (roll > difficulty) {
    d.cleared++;
    const loot = 20 + Math.floor(Math.random() * 50) * d.cleared;
    const share = Math.floor(loot / party.members.length);
    for (const m of party.members) {
      creditWallet(m.wallet, share);
      m.inventory.push({ type: 'dungeon_loot', qty: 1 });
      m.addEvent(tick, `Cleared dungeon level ${d.cleared} (+${share}g)`);
      addCombatXP(m);
    }
    if (d.cleared >= d.depth) {
      d.cleared = d.depth;
      bus.emit(EVENT.DUNGEON_CLEAR, { dungeon: dungeon.id, party: party.leader.partyId, tick });
    }
  } else {
    const dmg = 10 + Math.floor(Math.random() * 15);
    for (const m of party.members) {
      m.health = Math.max(0, (m.health || 100) - dmg);
      if (m.health <= 0) m.dead = true;
      m.addEvent(tick, `Dungeon encounter — took ${dmg} damage`);
    }
  }
}

function addCombatXP(agent) {
  for (const sk of ['melee', 'tactics', 'dodge']) {
    const key = `combat.${sk}`;
    if (agent.skills?.[key] !== undefined && agent.skills[key] < 10) {
      agent.skillXP = agent.skillXP || {};
      agent.skillXP[key] = (agent.skillXP[key] || 0) + 25;
      if (agent.skillXP[key] >= (agent.skills[key] + 1) * 100) {
        agent.skills[key]++;
        agent.skillXP[key] = 0;
      }
    }
  }
}

export function generateMonster(biomeId, tier) {
  const names = ['Slime', 'Goblin', 'Skeleton', 'Wolf', 'Bandit', 'Golem', 'Wraith', 'Dragon Whelp'];
  return {
    name: names[Math.floor(Math.random() * names.length)],
    level: tier,
    hp: 20 + tier * 15,
    power: 5 + tier * 4,
  };
}
