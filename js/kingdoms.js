import { EVENT } from './events.js';
import { hexKey, hexNeighbors } from './hex.js';
import { addSkillXP } from './skills.js';

export function initKingdoms(settlements) {
  return settlements.map(s => ({
    id: `realm_${s.id}`,
    name: `${s.name} Realm`,
    capitalId: s.id,
    settlementIds: [s.id],
    rulerId: null,
    military: 10,
    ambition: 0.4 + Math.random() * 0.4,
  }));
}

export function tickKingdoms(world, agents, kingdoms, bus, tick) {
  assignRulers(world, agents, kingdoms);
  if (tick % 48 !== 0) return;
  for (const kingdom of kingdoms) {
    const capital = world.settlements.find(s => s.id === kingdom.capitalId);
    if (!capital) continue;
    updateMilitary(kingdom, capital, agents);
    if (tick % 168 === 0) tryExpandTerritory(kingdom, capital, world, agents, kingdoms, bus, tick);
    if (tick % 336 === 0) tryConquestWar(kingdom, capital, world, agents, kingdoms, bus, tick);
    checkKingdomPromotion(capital, kingdom);
  }
}

function assignRulers(world, agents, kingdoms) {
  for (const settlement of world.settlements) {
    const kingdom = kingdoms.find(k => k.settlementIds.includes(settlement.id));
    const candidates = agents.filter(a =>
      !a.dead && !a.imprisoned && a.settlementId === settlement.id &&
      (a.job === 'noble' || a.crowned || a.job === 'guard' || a.job === 'merchant')
    );
    if (!candidates.length) {
      settlement.rulerId = null;
      if (kingdom) kingdom.rulerId = null;
      continue;
    }
    candidates.sort((a, b) => rulerScore(b) - rulerScore(a));
    const ruler = candidates[0];
    settlement.rulerId = ruler.id;
    settlement.rulerName = ruler.name;
    if (kingdom) {
      kingdom.rulerId = ruler.id;
      kingdom.rulerName = ruler.name;
    }
  }
}

function rulerScore(a) {
  let s = (a.skills?.['leadership.govern'] || 0) * 20 + (a.skills?.['leadership.command'] || 0) * 10;
  if (a.crowned) s += 80;
  if (a.job === 'noble') s += 40;
  if (a.job === 'guard') s += 15;
  s += walletRank(a) * 0.1;
  return s;
}

function walletRank(a) {
  const w = a.wallet || {};
  return (w.gold || 0) * 100 + (w.silver || 0);
}

function updateMilitary(kingdom, settlement, agents) {
  const forces = agents.filter(a =>
    !a.dead && !a.imprisoned && kingdom.settlementIds.includes(a.settlementId) &&
    (a.job === 'guard' || a.job === 'noble' || a.currentAction === 'conquer')
  );
  kingdom.military = forces.reduce((s, a) =>
    s + (a.skills?.['combat.melee'] || 0) + (a.skills?.['combat.tactics'] || 0) + 3, 10
  );
}

function tryExpandTerritory(kingdom, settlement, world, agents, kingdoms, bus, tick) {
  if (kingdom.ambition < 0.35) return;
  const border = findExpandableHex(settlement, world);
  if (!border) return;
  if (Math.random() > 0.25 + kingdom.ambition * 0.3) return;
  claimHex(border, settlement, world);
  settlement.recentEvents = pushEvent(settlement.recentEvents, `Claimed new land at (${border.q},${border.r})`, tick);
  bus.emit(EVENT.CONQUEST, { settlement: settlement.id, hex: border, peaceful: true, tick });
}

function tryConquestWar(attackerKingdom, attacker, world, agents, kingdoms, bus, tick) {
  if (attackerKingdom.military < 18 || attackerKingdom.ambition < 0.5) return;
  const targets = world.settlements.filter(s =>
    s.id !== attacker.id && !attackerKingdom.settlementIds.includes(s.id)
  );
  if (!targets.length) return;
  const defender = targets.reduce((best, s) =>
    (s.population < (best?.population ?? 999) ? s : best), null
  );
  const defKingdom = kingdoms.find(k => k.settlementIds.includes(defender.id));
  const defPower = defKingdom?.military || defender.population * 2;
  if (attackerKingdom.military < defPower * 0.85) return;
  if (Math.random() > 0.2 + attackerKingdom.ambition * 0.25) return;

  const won = attackerKingdom.military + Math.random() * 15 > defPower;
  if (won) {
    absorbSettlement(attackerKingdom, defender, world, kingdoms);
    attacker.tier = promoteTier(attacker.tier);
    attacker.recentEvents = pushEvent(attacker.recentEvents,
      `Conquered ${defender.name}! Kingdom grows.`, tick);
    bus.emit(EVENT.CONQUEST, { winner: attacker.id, loser: defender.id, tick });
    const ruler = agents.find(a => a.id === attacker.rulerId);
    if (ruler) {
      ruler.addEvent(tick, `Led conquest of ${defender.name}`);
      addSkillXP(ruler, 'leadership', 'govern', 30);
      addSkillXP(ruler, 'leadership', 'command', 20);
    }
  } else {
    attacker.recentEvents = pushEvent(attacker.recentEvents,
      `Failed assault on ${defender.name}`, tick);
    attackerKingdom.military = Math.max(5, attackerKingdom.military - 8);
  }
}

function absorbSettlement(kingdom, conquered, world, kingdoms) {
  kingdom.settlementIds.push(conquered.id);
  conquered.liegeId = kingdom.capitalId;
  conquered.conqueredBy = kingdom.capitalId;
  for (const tile of conquered.territory || []) {
    const hex = world.hexMap.get(hexKey(tile.q, tile.r));
    if (hex) hex.liegeSettlementId = kingdom.capitalId;
  }
  const other = kingdoms.find(k => k.settlementIds.includes(conquered.id) && k.id !== kingdom.id);
  if (other) {
    other.settlementIds = other.settlementIds.filter(id => id !== conquered.id);
  }
}

function findExpandableHex(settlement, world) {
  const candidates = [];
  for (const tile of settlement.territory || []) {
    for (const n of hexNeighbors(tile.q, tile.r)) {
      const key = hexKey(n.q, n.r);
      const hex = world.hexMap.get(key);
      if (!hex?.walkable || hex.settlementId || hex.dungeon) continue;
      if (candidates.some(c => c.q === n.q && c.r === n.r)) continue;
      candidates.push(n);
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}

function claimHex(hexCoord, settlement, world) {
  const hex = world.hexMap.get(hexKey(hexCoord.q, hexCoord.r));
  if (!hex) return;
  hex.settlementId = settlement.id;
  settlement.territory = settlement.territory || [];
  settlement.territory.push({ q: hex.q, r: hex.r });
}

function checkKingdomPromotion(settlement, kingdom) {
  if (kingdom.settlementIds.length >= 3 && settlement.tier !== 'kingdom') {
    settlement.tier = 'kingdom';
    kingdom.name = `${settlement.name} Kingdom`;
  } else if (kingdom.settlementIds.length >= 2 && ['hamlet', 'village'].includes(settlement.tier)) {
    settlement.tier = 'city';
  }
}

function promoteTier(tier) {
  const order = ['homestead', 'hamlet', 'village', 'town', 'city', 'kingdom'];
  const i = order.indexOf(tier);
  return i < order.length - 1 ? order[i + 1] : tier;
}

export function executeConquer(agent, settlement, world, bus, tick) {
  const border = findExpandableHex(settlement, world);
  if (!border) return false;
  claimHex(border, settlement, world);
  addSkillXP(agent, 'combat', 'melee', 12);
  addSkillXP(agent, 'leadership', 'command', 8);
  agent.addEvent(tick, `Secured borderlands`);
  settlement.recentEvents = pushEvent(settlement.recentEvents, `${agent.name} expanded the border`, tick);
  bus.emit(EVENT.CONQUEST, { settlement: settlement.id, agent: agent.id, hex: border, tick });
  return true;
}

function pushEvent(list, text, tick) {
  list = list || [];
  list.push({ tick, text });
  if (list.length > 12) list.shift();
  return list;
}

export function getKingdomForSettlement(kingdoms, settlementId) {
  return kingdoms?.find(k => k.settlementIds.includes(settlementId));
}
