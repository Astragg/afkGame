/** Kingdom diplomacy: alliances, tributaries, peace treaties, wars */
import { EVENT } from './events.js';

export function initDiplomacy(kingdoms) {
  for (const k of kingdoms) {
    k.diplomacy = k.diplomacy || {};
    k.atWar = k.atWar || [];
    k.allies = k.allies || [];
    k.tributaries = k.tributaries || [];
    k.warCooldown = 0;
  }
  return kingdoms;
}

export function tickDiplomacy(kingdoms, world, agents, bus, tick) {
  if (tick % 240 !== 0) return;

  for (const k of kingdoms) {
    if (k.warCooldown > 0) k.warCooldown--;
    _collectTribute(k, world, tick);
    _considerAlliance(k, kingdoms, world, tick, bus);
    _considerWar(k, kingdoms, world, agents, bus, tick);
    _resolvePeace(k, kingdoms, bus, tick);
  }
}

function _collectTribute(kingdom, world, tick) {
  for (const tributaryId of kingdom.tributaries || []) {
    const trib = world.settlements.find(s => s.id === tributaryId);
    const capital = world.settlements.find(s => s.id === kingdom.capitalId);
    if (!trib || !capital) continue;
    const amount = Math.floor((trib.foodStore || 0) * 0.08);
    if (amount > 0) {
      trib.foodStore -= amount;
      capital.foodStore = (capital.foodStore || 0) + amount;
      _pushEvt(trib, `Paid ${amount} food in tribute to ${capital.name}`, tick);
    }
    const silver = Math.floor(((trib.treasuryWallet?.silver || 0)) * 0.06);
    if (silver > 0) {
      trib.treasuryWallet = trib.treasuryWallet || { silver: 0, gold: 0, copper: 0, gems: 0, tokens: 0 };
      capital.treasuryWallet = capital.treasuryWallet || { silver: 0, gold: 0, copper: 0, gems: 0, tokens: 0 };
      trib.treasuryWallet.silver -= silver;
      capital.treasuryWallet.silver += silver;
    }
  }
}

function _considerAlliance(k, kingdoms, world, tick, bus) {
  if ((k.allies?.length || 0) >= 2) return;
  const capital = world.settlements.find(s => s.id === k.capitalId);
  if (!capital) return;

  for (const other of kingdoms) {
    if (other.id === k.id) continue;
    if (k.allies?.includes(other.id) || k.atWar?.includes(other.id)) continue;
    const otherCap = world.settlements.find(s => s.id === other.capitalId);
    if (!otherCap) continue;

    // ally with similar-strength neighbours
    const powerDiff = Math.abs((k.military || 10) - (other.military || 10));
    if (powerDiff < 20 && Math.random() < 0.12) {
      k.allies = k.allies || [];
      other.allies = other.allies || [];
      k.allies.push(other.id);
      other.allies.push(k.id);
      _pushEvt(capital, `Alliance forged with ${otherCap.name}!`, tick);
      _pushEvt(otherCap, `Alliance forged with ${capital.name}!`, tick);
      bus.emit(EVENT.CONQUEST, { type: 'alliance', a: k.id, b: other.id, tick });
      break;
    }
  }
}

function _considerWar(k, kingdoms, world, agents, bus, tick) {
  if (k.warCooldown > 0 || (k.atWar?.length || 0) >= 2) return;
  if ((k.military || 10) < 25 || k.ambition < 0.55) return;

  for (const other of kingdoms) {
    if (other.id === k.id || k.atWar?.includes(other.id) || k.allies?.includes(other.id)) continue;
    if ((other.military || 10) > (k.military || 10) * 1.5) continue;

    if (Math.random() < 0.07) {
      k.atWar = k.atWar || [];
      other.atWar = other.atWar || [];
      k.atWar.push(other.id);
      other.atWar.push(k.id);
      const cap = world.settlements.find(s => s.id === k.capitalId);
      const ocap = world.settlements.find(s => s.id === other.capitalId);
      _pushEvt(cap, `⚔ War declared on ${ocap?.name || other.id}!`, tick);
      _pushEvt(ocap, `⚔ War declared by ${cap?.name || k.id}!`, tick);
      bus.emit(EVENT.WAR, { attacker: k.id, defender: other.id, tick });
      break;
    }
  }
}

function _resolvePeace(k, kingdoms, bus, tick) {
  for (let i = k.atWar?.length - 1; i >= 0; i--) {
    const otherId = k.atWar[i];
    const other = kingdoms.find(x => x.id === otherId);
    if (!other) { k.atWar.splice(i, 1); continue; }

    // Random battle outcome each cycle
    if (Math.random() < 0.15) {
      const kPow = (k.military || 10) + Math.random() * 20;
      const oPow = (other.military || 10) + Math.random() * 20;
      if (kPow > oPow * 1.4) {
        // k wins
        k.military = Math.min(120, (k.military || 10) + 5);
        other.military = Math.max(5, (other.military || 10) - 10);
        other.tributaries = other.tributaries || [];
        if (!k.tributaries.includes(other.capitalId)) k.tributaries.push(other.capitalId);
      } else if (oPow > kPow * 1.4) {
        other.military = Math.min(120, (other.military || 10) + 5);
        k.military = Math.max(5, (k.military || 10) - 10);
        if (!other.tributaries.includes(k.capitalId)) other.tributaries.push(k.capitalId);
      }

      // peace after enough fighting
      if (Math.random() < 0.3) {
        k.atWar.splice(i, 1);
        const j = other.atWar?.indexOf(k.id) ?? -1;
        if (j >= 0) other.atWar.splice(j, 1);
        k.warCooldown = 10;
        other.warCooldown = 10;
        bus.emit('peace', { a: k.id, b: other.id, tick });
      }
    }
  }
}

function _pushEvt(settlement, text, tick) {
  if (!settlement) return;
  settlement.recentEvents = settlement.recentEvents || [];
  settlement.recentEvents.push({ tick, text });
  if (settlement.recentEvents.length > 12) settlement.recentEvents.shift();
}
