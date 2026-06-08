/** Visible trade caravans that walk between settlements */

export function initCaravans() { return []; }

export function tickCaravans(caravans, world, agents, bus, tick) {
  if (tick % 144 === 0) _spawnCaravans(caravans, world);

  for (const c of caravans) {
    if (c.arrived || c.raided) continue;
    c.progress = Math.min(1, c.progress + 0.008);
    const idx = Math.min(c.path.length - 1, Math.floor(c.progress * c.path.length));
    c.q = c.path[idx].q;
    c.r = c.path[idx].r;

    // chance of thief raid
    if (!c.raided && c.progress > 0.2 && c.progress < 0.9) {
      const thief = agents.find(a =>
        !a.dead && !a.imprisoned && a.job === 'thief' &&
        Math.abs(a.q - c.q) + Math.abs(a.r - c.r) <= 2
      );
      if (thief && Math.random() < 0.004) {
        c.raided = true;
        const loot = Math.floor(c.amount * 0.5);
        thief.wallet = thief.wallet || { gold: 0, silver: 0, copper: 0, gems: 0, tokens: 0 };
        thief.wallet.silver += loot;
        thief.addEvent(tick, `Raided a caravan carrying ${c.goods}! Stole ${loot}s`);
        const origin = world.settlements.find(s => s.id === c.fromId);
        if (origin) _pushEvent(origin, `A caravan was raided en route to ${c.toName}!`, tick);
      }
    }

    if (c.progress >= 1) {
      c.arrived = true;
      const dest = world.settlements.find(s => s.id === c.toId);
      if (dest && !c.raided) {
        if (c.goods === 'food') dest.foodStore = (dest.foodStore || 0) + c.amount;
        else dest.treasuryWallet = dest.treasuryWallet || { gold: 0, silver: 0, copper: 0, gems: 0, tokens: 0 },
             dest.treasuryWallet.silver += c.amount;
        dest.recentTrades = dest.recentTrades || [];
        dest.recentTrades.push({ from: c.fromName, to: c.toName, amount: c.amount, goods: c.goods, tick });
        if (dest.recentTrades.length > 8) dest.recentTrades.shift();
      }
    }
  }

  // cull old ones
  if (caravans.length > 40) caravans.splice(0, caravans.length - 40);
  return caravans.filter(c => !c.arrived && !c.raided);
}

function _spawnCaravans(caravans, world) {
  const settlements = world.settlements.filter(s => s.foodStore > 80 || (s.treasuryWallet?.silver || 0) > 200);
  if (settlements.length < 2) return;

  const count = Math.min(4, Math.floor(settlements.length / 2));
  for (let i = 0; i < count; i++) {
    const from = settlements[Math.floor(Math.random() * settlements.length)];
    const others = world.settlements.filter(s => s.id !== from.id);
    if (!others.length) continue;
    const to = others[Math.floor(Math.random() * others.length)];

    const goods = (from.foodStore || 0) > 120 ? 'food' : 'silver';
    let amount;
    if (goods === 'food') {
      amount = Math.floor(20 + Math.random() * 40);
      if (from.foodStore < amount + 40) continue;
      from.foodStore -= amount;
    } else {
      amount = Math.floor(15 + Math.random() * 30);
      if ((from.treasuryWallet?.silver || 0) < amount) continue;
      from.treasuryWallet.silver -= amount;
    }

    caravans.push({
      id: `cv_${Date.now()}_${i}`,
      fromId: from.id,
      toId: to.id,
      fromName: from.name,
      toName: to.name,
      goods,
      amount,
      progress: 0,
      path: _linePath(from.hex, to.hex),
      q: from.hex.q,
      r: from.hex.r,
      arrived: false,
      raided: false,
    });
  }
}

function _linePath(from, to) {
  const steps = Math.max(2, Math.round(_hexDist(from, to)));
  const path = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    path.push({ q: Math.round(from.q + (to.q - from.q) * t), r: Math.round(from.r + (to.r - from.r) * t) });
  }
  return path;
}

function _hexDist(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

function _pushEvent(settlement, text, tick) {
  settlement.recentEvents = settlement.recentEvents || [];
  settlement.recentEvents.push({ tick, text });
  if (settlement.recentEvents.length > 12) settlement.recentEvents.shift();
}
