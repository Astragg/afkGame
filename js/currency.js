/** Multi-currency system — gold, silver, copper, gems, guild tokens */
export const CURRENCIES = ['gold', 'silver', 'copper', 'gems', 'tokens'];

export const EXCHANGE = { gold: 100, silver: 1, copper: 0.01, gems: 50, tokens: 25 };

export function createWallet(gold = 0, silver = 0, copper = 0, gems = 0, tokens = 0) {
  return { gold, silver, copper, gems, tokens };
}

export function walletFromLegacyGold(gold) {
  const g = Math.floor(gold);
  const remainder = Math.floor((gold - g) * 100);
  const s = remainder + (g % 1) * 100;
  return createWallet(g, Math.floor(s), Math.floor(Math.random() * 50), 0, 0);
}

export function walletTotal(wallet) {
  if (!wallet) return 0;
  return (wallet.gold || 0) * 100 + (wallet.silver || 0) + (wallet.copper || 0) * 0.01
    + (wallet.gems || 0) * 50 + (wallet.tokens || 0) * 25;
}

export function formatWallet(wallet) {
  if (!wallet) return '0c';
  const parts = [];
  if (wallet.gold) parts.push(`${wallet.gold}g`);
  if (wallet.silver) parts.push(`${wallet.silver}s`);
  if (wallet.copper) parts.push(`${wallet.copper}c`);
  if (wallet.gems) parts.push(`${wallet.gems}♦`);
  if (wallet.tokens) parts.push(`${wallet.tokens}⊛`);
  return parts.length ? parts.join(' ') : '0c';
}

export function addToWallet(wallet, currency, amount) {
  wallet[currency] = (wallet[currency] || 0) + amount;
  normalizeWallet(wallet);
}

export function subtractFromWallet(wallet, currency, amount) {
  if ((wallet[currency] || 0) < amount) return false;
  wallet[currency] -= amount;
  return true;
}

export function payFromWallet(wallet, amountSilver) {
  if (!wallet) return false;
  normalizeWallet(wallet);
  let remaining = amountSilver;
  if (wallet.copper >= remaining * 100) {
    wallet.copper -= remaining * 100;
    normalizeWallet(wallet);
    return true;
  }
  if (wallet.silver >= remaining) {
    wallet.silver -= remaining;
    normalizeWallet(wallet);
    return true;
  }
  const total = walletTotal(wallet);
  if (total < amountSilver) return false;
  wallet.copper = 0;
  wallet.silver = 0;
  wallet.gold = 0;
  const left = total - amountSilver;
  wallet.silver = Math.floor(left);
  wallet.copper = Math.floor((left % 1) * 100);
  normalizeWallet(wallet);
  return true;
}

export function normalizeWallet(wallet) {
  // coerce any missing/NaN fields to safe integers first
  wallet.gold = num(wallet.gold);
  wallet.silver = num(wallet.silver);
  wallet.copper = num(wallet.copper);
  wallet.gems = num(wallet.gems);
  wallet.tokens = num(wallet.tokens);
  while (wallet.copper >= 100) { wallet.copper -= 100; wallet.silver++; }
  while (wallet.silver >= 100) { wallet.silver -= 100; wallet.gold++; }
  while (wallet.copper < 0 && wallet.silver > 0) { wallet.silver--; wallet.copper += 100; }
  while (wallet.silver < 0 && wallet.gold > 0) { wallet.gold--; wallet.silver += 100; }
  if (wallet.silver < 0) wallet.silver = 0;
  if (wallet.copper < 0) wallet.copper = 0;
}

function num(v) {
  return Number.isFinite(v) ? v : 0;
}

export function creditWallet(wallet, amountSilver) {
  if (!wallet) return;
  wallet.silver = num(wallet.silver) + num(amountSilver);
  normalizeWallet(wallet);
}
