import { EVENT } from './events.js';
import { creditWallet } from './currency.js';
import { hexKey } from './hex.js';

export function initShips(world, rng) {
  const ships = [];
  // Only coastal settlements get ships
  const coastal = world.settlements.filter(s => _isCoastal(s, world.hexMap));
  for (const settlement of coastal) {
    settlement.isCoastal = true;
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i++) {
      ships.push({
        id: `ship_${settlement.id}_${i}`,
        name: _shipName(rng),
        homePort: settlement.id,
        q: settlement.hex.q,
        r: settlement.hex.r,
        cargo: 0,
        maxCargo: 80,
        state: 'docked',
        destId: null,
        path: [],
        pirated: false,
      });
    }
  }
  return ships;
}

export function tickShips(ships, world, agents, bus, tick, rng) {
  if (tick % 24 !== 0) return;
  const coastal = world.settlements.filter(s => s.isCoastal);
  if (coastal.length < 2) return;

  for (const ship of ships) {
    if (ship.state === 'docked') {
      if (tick % 96 !== 0) continue;
      // Find a coastal destination
      const others = coastal.filter(s => s.id !== ship.homePort);
      if (!others.length) continue;
      const dest = others[Math.floor(rng.next() * others.length)];
      const home = world.settlements.find(s => s.id === ship.homePort);
      if (!home || home.foodStore < 20) continue;
      // Load cargo
      const load = Math.min(ship.maxCargo, Math.floor(home.foodStore * 0.3));
      home.foodStore -= load;
      ship.cargo = load;
      ship.destId = dest.id;
      ship.state = 'sailing';
      ship.path = _seaPath(home.hex, dest.hex);
      ship.pathIdx = 0;
      _pushEvent(home, `${ship.name} departed for ${dest.name} with ${load} cargo`, tick);
    } else if (ship.state === 'sailing') {
      // Move along path
      ship.pathIdx = (ship.pathIdx || 0) + 1;
      if (ship.pathIdx < ship.path.length) {
        const pt = ship.path[ship.pathIdx];
        ship.q = pt.q;
        ship.r = pt.r;
      } else {
        // Arrived
        const dest = world.settlements.find(s => s.id === ship.destId);
        if (dest) {
          // Pirate check
          const pirateChance = _pirateActivity(agents, dest);
          if (rng.next() < pirateChance) {
            const stolen = Math.floor(ship.cargo * 0.6);
            ship.cargo -= stolen;
            ship.pirated = true;
            _pushEvent(dest, `${ship.name} was raided by pirates! Lost ${stolen} cargo`, tick);
            bus.emit(EVENT.CARAVAN_RAIDED, { ship, settlement: dest, tick });
          }
          dest.foodStore += ship.cargo;
          if (dest.treasuryWallet) creditWallet(dest.treasuryWallet, Math.floor(ship.cargo * 0.3));
          _pushEvent(dest, `${ship.name} arrived with ${ship.cargo} trade goods`, tick);
        }
        ship.cargo = 0;
        ship.state = 'returning';
        ship.destId = ship.homePort;
        ship.path = ship.path.slice().reverse();
        ship.pathIdx = 0;
      }
    } else if (ship.state === 'returning') {
      ship.pathIdx = (ship.pathIdx || 0) + 1;
      if (ship.pathIdx < ship.path.length) {
        const pt = ship.path[ship.pathIdx];
        ship.q = pt.q;
        ship.r = pt.r;
      } else {
        ship.state = 'docked';
        ship.pirated = false;
        const home = world.settlements.find(s => s.id === ship.homePort);
        if (home) {
          ship.q = home.hex.q;
          ship.r = home.hex.r;
        }
      }
    }
  }
}

function _isCoastal(settlement, hexMap) {
  const dirs = [[0,1],[1,0],[-1,1],[1,-1],[0,-1],[-1,0]];
  const { q, r } = settlement.hex;
  for (const [dq, dr] of dirs) {
    const hex = hexMap.get(hexKey(q + dq, r + dr));
    if (hex && !hex.walkable) return true;
  }
  return false;
}

function _pirateActivity(agents, settlement) {
  const thieves = agents.filter(a =>
    !a.dead && (a.job === 'thief' || a.job === 'assassin' || a.job === 'spy') &&
    (a.settlementId === settlement.id || a.employerId === settlement.id)
  ).length;
  return Math.min(0.35, thieves * 0.06);
}

function _seaPath(from, to) {
  const steps = Math.max(Math.abs(from.q - to.q), Math.abs(from.r - to.r), 4);
  const path = [];
  for (let i = 0; i <= steps; i++) {
    path.push({
      q: Math.round(from.q + (to.q - from.q) * i / steps),
      r: Math.round(from.r + (to.r - from.r) * i / steps),
    });
  }
  return path;
}

const SHIP_PREFIXES = ['Sea','Storm','Iron','Silver','Swift','Dark','Golden','Brave','Thunder','Void'];
const SHIP_NOUNS = ['Dancer','Crest','Wing','Blade','Star','Runner','Fang','Tide','Serpent','Gale'];
function _shipName(rng) {
  return `The ${rng.pick(SHIP_PREFIXES)} ${rng.pick(SHIP_NOUNS)}`;
}

function _pushEvent(settlement, text, tick) {
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}
