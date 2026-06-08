/** Axial hex coordinate math and pathfinding */

export const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function hexKey(q, r) {
  return `${q},${r}`;
}

export function parseHexKey(key) {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -dq - dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function hexNeighbors(q, r) {
  return HEX_DIRS.map(d => ({ q: q + d.q, r: r + d.r }));
}

export function hexToPixel(q, r, size) {
  const x = size * (3 / 2 * q);
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return { x, y };
}

export function pixelToHex(px, py, size) {
  const q = (2 / 3 * px) / size;
  const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / size;
  return hexRound(q, r);
}

function hexRound(q, r) {
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const xDiff = Math.abs(rx - x), yDiff = Math.abs(ry - y), zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

export function generateHexGrid(radius) {
  const hexes = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      hexes.push({ q, r });
    }
  }
  return hexes;
}

/** A* pathfinding with elevation cost */
export function findPath(start, goal, hexMap, options = {}) {
  const { maxCost = Infinity, canSwim = false, canFly = false, maxExpansions = 1400 } = options;
  const startKey = hexKey(start.q, start.r);
  const goalKey = hexKey(goal.q, goal.r);
  if (!hexMap.has(startKey) || !hexMap.has(goalKey)) return null;

  const open = new Map();
  const closed = new Set();
  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  let expansions = 0;

  open.set(startKey, hexDistance(start, goal));

  while (open.size > 0) {
    if (++expansions > maxExpansions) return null; // give up on far/unreachable goals
    let currentKey = null;
    let bestF = Infinity;
    for (const [k, f] of open) {
      if (f < bestF) { bestF = f; currentKey = k; }
    }
    const current = parseHexKey(currentKey);
    if (currentKey === goalKey) {
      const path = [current];
      let ck = currentKey;
      while (cameFrom.has(ck)) {
        ck = cameFrom.get(ck);
        path.unshift(parseHexKey(ck));
      }
      return path;
    }
    open.delete(currentKey);
    closed.add(currentKey);
    const currentG = gScore.get(currentKey);

    for (const n of hexNeighbors(current.q, current.r)) {
      const nKey = hexKey(n.q, n.r);
      if (closed.has(nKey) || !hexMap.has(nKey)) continue;
      const tile = hexMap.get(nKey);
      const moveCost = getMoveCost(hexMap.get(currentKey), tile, { canSwim, canFly });
      if (moveCost >= Infinity) continue;
      const tentative = currentG + moveCost;
      if (tentative > maxCost) continue;
      if (!gScore.has(nKey) || tentative < gScore.get(nKey)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentative);
        open.set(nKey, tentative + hexDistance(n, goal));
      }
    }
  }
  return null;
}

export function getMoveCost(from, to, { canSwim = false, canFly = false } = {}) {
  if (!from || !to) return Infinity;
  if (canFly) return 1;
  if (!to.walkable && to.waterDepth < 0.3) return Infinity;
  let cost = to.baseMoveCost || 1;
  if (to.waterDepth > 0.5 && !canSwim) {
    if (to.waterDepth > 1.5) return Infinity;
    cost *= 3;
  } else if (to.waterDepth > 0.5) {
    cost *= 2;
  }
  const elevDiff = to.elevation - from.elevation;
  if (elevDiff > 0.15) {
    cost *= 1 + elevDiff * 4;
    if (elevDiff > 0.35 && !canFly) return Infinity;
  }
  if (to.road) cost *= 0.6;
  return cost;
}
