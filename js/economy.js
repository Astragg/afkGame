import { EVENT } from './events.js';
import { creditWallet, payFromWallet, formatWallet, walletTotal } from './currency.js';
import { addSkillXP, RACE_SKILL_DEPTH } from './skills.js';

export const JOB_TYPES = {
  // Food & survival
  farmer:      { wage: 12, skill: 'survival.farm',     produces: 'food',     desc: 'Works the fields' },
  fisher:      { wage: 10, skill: 'survival.fish',     produces: 'food',     desc: 'Fishes rivers & sea' },
  hunter:      { wage: 11, skill: 'survival.hunt',     produces: 'food',     desc: 'Hunts wildlife' },
  herbalist:   { wage: 13, skill: 'survival.forage',   produces: 'medicine', desc: 'Gathers healing plants' },
  shepherd:    { wage: 10, skill: 'survival.farm',     produces: 'food',     desc: 'Tends livestock' },
  // Crafts
  blacksmith:  { wage: 22, skill: 'craft.smith',       produces: 'tools',    desc: 'Forges weapons & tools' },
  carpenter:   { wage: 18, skill: 'craft.build',       produces: 'timber',   desc: 'Crafts wood structures' },
  stonemason:  { wage: 20, skill: 'craft.build',       produces: 'stone',    desc: 'Shapes stone for construction' },
  baker:       { wage: 12, skill: 'craft.brew',        produces: 'food',     desc: 'Converts grain into food' },
  brewer:      { wage: 15, skill: 'craft.brew',        produces: 'ale',      desc: 'Brews ale, raises morale' },
  alchemist:   { wage: 28, skill: 'craft.enchant',     produces: 'potions',  desc: 'Crafts potions & reagents' },
  lumberjack:  { wage: 14, skill: 'survival.forage',   produces: 'timber',   desc: 'Fells trees for building' },
  miner:       { wage: 18, skill: 'craft.smith',       produces: 'ore',      desc: 'Extracts metals & gems' },
  // Commerce & admin
  merchant:    { wage: 16, skill: 'leadership.trade',  produces: 'goods',    desc: 'Trades between settlements' },
  clerk:       { wage: 8,  skill: 'leadership.persuade', produces: null,     desc: 'Administrative work' },
  taxcollector:{ wage: 14, skill: 'leadership.govern', produces: 'silver',   desc: 'Collects taxes from residents' },
  innkeeper:   { wage: 14, skill: 'leadership.persuade', produces: null,     desc: 'Runs the tavern' },
  courier:     { wage: 10, skill: 'leadership.trade',  produces: null,       desc: 'Delivers messages & goods' },
  bard:        { wage: 11, skill: 'leadership.persuade', produces: null,     desc: 'Entertains the populace' },
  // Military & order
  guard:       { wage: 18, skill: 'combat.melee',      produces: null,       desc: 'Keeps the peace' },
  watchman:    { wage: 12, skill: 'combat.melee',      produces: null,       desc: 'Patrols the streets' },
  warlord:     { wage: 32, skill: 'combat.tactics',    produces: null,       desc: 'Commands military forces' },
  ranger:      { wage: 16, skill: 'combat.archery',    produces: 'food',     desc: 'Scouts territory & hunts' },
  executioner: { wage: 15, skill: 'combat.melee',      produces: null,       desc: 'Carries out sentences' },
  // Magic & knowledge
  mage:        { wage: 25, skill: 'magic.elemental',   produces: 'reagents', desc: 'Wields elemental magic' },
  priest:      { wage: 14, skill: 'magic.healing',     produces: null,       desc: 'Heals and blesses' },
  enchanter:   { wage: 30, skill: 'magic.enchant',     produces: 'artifacts',desc: 'Enchants items & weapons' },
  scholar:     { wage: 18, skill: 'leadership.govern', produces: null,       desc: 'Researches and records' },
  chronicler:  { wage: 12, skill: 'leadership.persuade', produces: null,     desc: 'Records history' },
  healer:      { wage: 16, skill: 'magic.healing',     produces: null,       desc: 'Tends the sick & wounded' },
  // Crime & shadow
  thief:       { wage: 0,  skill: 'crime.stealth',     produces: null,       desc: 'Steals from the wealthy' },
  spy:         { wage: 0,  skill: 'crime.stealth',     produces: null,       desc: 'Gathers intelligence' },
  assassin:    { wage: 0,  skill: 'crime.assassinate', produces: null,       desc: 'Takes contracts on lives' },
  // Leadership
  noble:       { wage: 35, skill: 'leadership.govern', produces: null,       desc: 'Rules and governs' },
  diplomat:    { wage: 24, skill: 'leadership.command', produces: null,      desc: 'Negotiates with kingdoms' },
  adventurer:  { wage: 8,  skill: 'combat.tactics',    produces: 'loot',     desc: 'Explores dungeons' },
  architect:   { wage: 26, skill: 'craft.build',       produces: null,       desc: 'Designs & oversees buildings' },
};

export function tickEconomy(world, agents, bus, tick, season) {
  for (const settlement of world.settlements) {
    tickSettlementEconomy(settlement, agents, world, bus, tick, season);
  }
}

function getTreasury(settlement) {
  settlement.treasuryWallet = settlement.treasuryWallet || { gold: 0, silver: settlement.treasury || 0, copper: 0, gems: 0, tokens: 0 };
  return settlement.treasuryWallet;
}

function tickSettlementEconomy(settlement, agents, world, bus, tick, season) {
  const residents = agents.filter(a => !a.dead && a.settlementId === settlement.id);
  settlement.population = residents.length;
  settlement.unemployment = residents.filter(a => !a.job).length;
  const treasury = getTreasury(settlement);

  // Seasonal food multiplier + drought penalty
  const seasonMult = season === 'summer' ? 1.6 : season === 'spring' ? 1.3 : season === 'winter' ? 0.35 : 1.0;
  if (settlement.droughtTicks > 0) {
    settlement.droughtTicks--;
  }
  const droughtPenalty = settlement.droughtTicks > 0 ? 0.5 : 1.0;
  const foodMult = seasonMult * droughtPenalty;

  for (const jobDef of settlement.jobs) {
    const info = JOB_TYPES[jobDef.type];
    if (!info) continue;
    const workers = residents.filter(a => a.job === jobDef.type);
    for (const worker of workers) {
      // Nobles get bonus wage, peasants get baseline
      const classBonus = worker.socialClass === 'noble' ? 1.4 : worker.socialClass === 'merchant' ? 1.15 : 1.0;
      const wage = Math.round(info.wage * classBonus);
      if ((treasury.silver || 0) + (treasury.gold || 0) * 100 >= wage) {
        if (treasury.silver >= wage) treasury.silver -= wage;
        else { treasury.gold -= 1; treasury.silver += 100 - wage; }
        worker.wallet = worker.wallet || { gold: 0, silver: 0, copper: 0, gems: 0, tokens: 0 };
        creditWallet(worker.wallet, wage);
        worker.addEvent(tick, `Earned ${wage}s as ${jobDef.type}`);
      }
      const t = jobDef.type;
      // Food production
      if (t === 'farmer' && tick % 24 === 0) {
        const y = Math.floor((8 + (worker.skills?.['survival.farm'] || 0) * 2) * foodMult);
        settlement.foodStore += y;
        addSkillXP(worker, 'survival', 'farm', 10);
      }
      if (t === 'fisher' && tick % 12 === 0) {
        settlement.foodStore += 5 + (worker.skills?.['survival.fish'] || 0);
        addSkillXP(worker, 'survival', 'fish', 8);
      }
      if (t === 'hunter' && tick % 18 === 0) {
        const y = Math.floor((4 + (worker.skills?.['survival.hunt'] || 0)) * foodMult * 0.8);
        settlement.foodStore += y;
        addSkillXP(worker, 'survival', 'hunt', 10);
        addSkillXP(worker, 'combat', 'archery', 5);
      }
      if (t === 'shepherd' && tick % 24 === 0) {
        settlement.foodStore += Math.floor(3 * foodMult);
        addSkillXP(worker, 'survival', 'farm', 6);
      }
      if (t === 'baker' && tick % 24 === 0 && (settlement.foodStore || 0) > 10) {
        settlement.foodStore += Math.floor(3 * foodMult); // efficiency gain
        addSkillXP(worker, 'craft', 'brew', 8);
      }
      if (t === 'herbalist' && tick % 36 === 0) {
        addSkillXP(worker, 'survival', 'forage', 10);
        addSkillXP(worker, 'magic', 'healing', 6);
        // passive healing bonus for settlement
        for (const r of residents.filter(a => a.health < 80).slice(0, 2)) {
          r.health = Math.min(100, r.health + 6);
        }
      }
      if (t === 'healer' && tick % 24 === 0) {
        addSkillXP(worker, 'magic', 'healing', 12);
        for (const r of residents.filter(a => a.health < 90).slice(0, 3)) {
          r.health = Math.min(100, r.health + 8);
        }
      }
      if (t === 'brewer' && tick % 48 === 0) {
        addSkillXP(worker, 'craft', 'brew', 10);
        // ale boosts social needs
        for (const r of residents.slice(0, 4)) r.needs.social = Math.min(100, (r.needs.social || 60) + 10);
        for (const r of residents.slice(0, 4)) r.needs.fun = Math.min(100, (r.needs.fun || 60) + 8);
      }
      if (t === 'lumberjack' && tick % 24 === 0) {
        addSkillXP(worker, 'survival', 'forage', 8);
        creditWallet(treasury, 4);
      }
      if (t === 'miner' && tick % 36 === 0) {
        addSkillXP(worker, 'craft', 'smith', 8);
        if (Math.random() < 0.15) treasury.gems = (treasury.gems || 0) + 1;
        creditWallet(treasury, 6);
      }
      if (t === 'merchant' && tick % 48 === 0) {
        tradeBetweenSettlements(world, settlement, bus, tick);
        if (Math.random() < 0.3) creditWallet(worker.wallet, 5 + Math.floor(Math.random() * 10));
        addSkillXP(worker, 'leadership', 'trade', 10);
      }
      if (t === 'taxcollector' && tick % 24 === 0) {
        const bonus = Math.floor(settlement.population * 0.5);
        creditWallet(treasury, bonus);
        addSkillXP(worker, 'leadership', 'govern', 8);
      }
      if (t === 'innkeeper' && tick % 36 === 0) {
        addSkillXP(worker, 'leadership', 'persuade', 8);
        for (const r of residents.slice(0, 5)) r.needs.rest = Math.min(100, (r.needs.rest || 70) + 5);
      }
      if (t === 'bard' && tick % 36 === 0) {
        addSkillXP(worker, 'leadership', 'persuade', 10);
        for (const r of residents.slice(0, 6)) {
          r.needs.fun = Math.min(100, (r.needs.fun || 60) + 12);
          r.needs.social = Math.min(100, (r.needs.social || 60) + 8);
        }
      }
      if (t === 'courier' && tick % 36 === 0) {
        addSkillXP(worker, 'leadership', 'trade', 6);
        creditWallet(treasury, 3);
      }
      if (t === 'blacksmith' && tick % 36 === 0) {
        creditWallet(treasury, 8);
        worker.inventory.push({ type: 'tools', qty: 1 });
        addSkillXP(worker, 'craft', 'smith', 12);
      }
      if (t === 'carpenter' && tick % 36 === 0) {
        addSkillXP(worker, 'craft', 'build', 10);
        creditWallet(treasury, 5);
      }
      if (t === 'stonemason' && tick % 36 === 0) {
        addSkillXP(worker, 'craft', 'build', 12);
        creditWallet(treasury, 6);
      }
      if (t === 'architect' && tick % 48 === 0) {
        addSkillXP(worker, 'craft', 'build', 14);
        addSkillXP(worker, 'leadership', 'govern', 6);
        // Speed up construction
        for (const site of settlement.constructionQueue || []) {
          site.progress = Math.min(site.totalTicks, site.progress + 2);
        }
      }
      if (t === 'alchemist' && tick % 48 === 0) {
        treasury.gems = (treasury.gems || 0) + 1;
        addSkillXP(worker, 'craft', 'enchant', 12);
        addSkillXP(worker, 'magic', 'elemental', 8);
        worker.inventory.push({ type: 'potion', qty: 1 });
      }
      if (t === 'enchanter' && tick % 48 === 0) {
        treasury.tokens = (treasury.tokens || 0) + 1;
        addSkillXP(worker, 'magic', 'enchant', 15);
        addSkillXP(worker, 'craft', 'enchant', 10);
      }
      if (t === 'mage' && tick % 48 === 0) {
        treasury.gems = (treasury.gems || 0) + 1;
        addSkillXP(worker, 'magic', 'elemental', 15);
        addSkillXP(worker, 'magic', 'enchant', 10);
        worker.mana = Math.min(100, (worker.mana || 50) + 5);
      }
      if (t === 'priest' && tick % 36 === 0) {
        addSkillXP(worker, 'magic', 'healing', 12);
        for (const r of residents.slice(0, 3)) r.needs.safety = Math.min(100, (r.needs.safety || 70) + 8);
      }
      if (t === 'scholar' && tick % 48 === 0) {
        addSkillXP(worker, 'leadership', 'govern', 12);
        creditWallet(treasury, 4);
      }
      if (t === 'chronicler' && tick % 48 === 0) {
        addSkillXP(worker, 'leadership', 'persuade', 8);
      }
      if (t === 'guard' && tick % 24 === 0) {
        addSkillXP(worker, 'combat', 'melee', 10);
        addSkillXP(worker, 'combat', 'tactics', 8);
      }
      if (t === 'watchman' && tick % 24 === 0) {
        addSkillXP(worker, 'combat', 'melee', 6);
        addSkillXP(worker, 'combat', 'dodge', 6);
      }
      if (t === 'warlord' && tick % 36 === 0) {
        addSkillXP(worker, 'combat', 'tactics', 15);
        addSkillXP(worker, 'combat', 'melee', 10);
        addSkillXP(worker, 'leadership', 'command', 12);
      }
      if (t === 'ranger' && tick % 24 === 0) {
        addSkillXP(worker, 'combat', 'archery', 12);
        addSkillXP(worker, 'survival', 'hunt', 8);
        settlement.foodStore += Math.floor(3 * foodMult);
      }
      if (t === 'executioner' && tick % 48 === 0) {
        addSkillXP(worker, 'combat', 'melee', 8);
      }
      if (t === 'noble' && tick % 48 === 0) {
        addSkillXP(worker, 'leadership', 'govern', 15);
        addSkillXP(worker, 'leadership', 'command', 10);
      }
      if (t === 'diplomat' && tick % 48 === 0) {
        addSkillXP(worker, 'leadership', 'command', 12);
        addSkillXP(worker, 'leadership', 'persuade', 10);
      }
      if (t === 'thief' && tick % 48 === 0) {
        addSkillXP(worker, 'crime', 'stealth', 12);
      }
      if (t === 'spy' && tick % 48 === 0) {
        addSkillXP(worker, 'crime', 'stealth', 10);
        addSkillXP(worker, 'leadership', 'persuade', 6);
      }
      if (t === 'assassin' && tick % 48 === 0) {
        addSkillXP(worker, 'crime', 'assassinate', 14);
        addSkillXP(worker, 'crime', 'stealth', 8);
      }
      if (t === 'adventurer' && tick % 36 === 0) {
        addSkillXP(worker, 'combat', 'tactics', 10);
        addSkillXP(worker, 'combat', 'melee', 8);
      }
      if (t === 'clerk' && tick % 48 === 0) {
        addSkillXP(worker, 'leadership', 'persuade', 8);
      }
    }
  }

  if (tick % 24 === 0) rehireUnemployed(settlement, residents);

  if (tick % 24 === 0) {
    for (const agent of residents) {
      agent.wallet = agent.wallet || { gold: 0, silver: 0, copper: 0, gems: 0, tokens: 0 };
      const tax = Math.floor(walletTotal(agent.wallet) * settlement.taxRate * 0.04);
      if (tax > 0 && payFromWallet(agent.wallet, tax)) {
        creditWallet(treasury, tax);
      }
    }
    settlement.treasury = Math.floor((treasury.gold || 0) * 100 + (treasury.silver || 0));
    if (settlement.debt > 0) {
      settlement.debt *= 1.001;
      if (settlement.treasury < settlement.debt * 2 && settlement.debt > 1000) {
        bus.emit(EVENT.BANKRUPTCY, { settlement, tick });
      }
    }
  }

  // ambient subsistence: foraging, gardens, hunting outside the job system.
  // keeps settlements from total extinction while farmers still drive surplus.
  if (tick % 24 === 0) {
    const subsistence = Math.ceil(settlement.population * 0.7);
    settlement.foodStore = Math.min(settlement.granaryCapacity || 600, (settlement.foodStore || 0) + subsistence);
  }

  if (settlement.foodStore <= 0 && settlement.population > 0 && tick % 168 === 0) {
    bus.emit(EVENT.FAMINE, { settlement, tick });
  }

  checkTierPromotion(settlement);
}

function tradeBetweenSettlements(world, from, bus, tick) {
  const others = world.settlements.filter(s => s.id !== from.id);
  if (!others.length) return;
  const target = others[Math.floor(Math.random() * others.length)];
  const amount = 15 + Math.floor(Math.random() * 30);
  if (from.foodStore > amount + 30) {
    from.foodStore -= amount;
    target.foodStore += amount;
    const treasury = getTreasury(from);
    creditWallet(treasury, Math.floor(amount * 0.4));
    const trade = { from: from.name, to: target.name, goods: 'food', amount, tick };
    from.recentTrades = pushRecent(from.recentTrades, trade);
    target.recentTrades = pushRecent(target.recentTrades, { ...trade, inbound: true });
    bus.emit(EVENT.TRADE, { from: from.id, to: target.id, goods: 'food', amount, tick });
  }
}

function pushRecent(list, entry) {
  list = list || [];
  list.push(entry);
  if (list.length > 8) list.shift();
  return list;
}

const JOB_AFFINITY = {
  farmer: { survival: ['farm', 'forage'], any: 1 },
  fisher: { survival: ['fish'], any: 1 },
  guard: { combat: ['melee', 'tactics'], leadership: ['command'] },
  merchant: { leadership: ['trade', 'persuade'] },
  blacksmith: { craft: ['smith', 'engineer'] },
  mage: { magic: ['elemental', 'enchant', 'illusion'] },
  priest: { magic: ['healing'] },
  noble: { leadership: ['govern', 'command'] },
  thief: { crime: ['stealth', 'pickpocket'] },
  adventurer: { combat: ['tactics', 'melee'], survival: ['hunt'] },
  clerk: { leadership: ['persuade'] },
};

const RACE_JOB_BONUS = {
  Elf: { mage: 25, priest: 10 },
  Dwarf: { blacksmith: 25, guard: 10 },
  Orc: { guard: 20, adventurer: 15 },
  Goblin: { thief: 25, merchant: 10 },
  Human: { merchant: 10, noble: 10 },
};

export function jobSuitability(agent, jobType) {
  let score = 5;
  const aff = JOB_AFFINITY[jobType];
  if (aff) {
    for (const [branch, skills] of Object.entries(aff)) {
      if (branch === 'any') { score += aff.any; continue; }
      for (const sk of skills) {
        score += (agent.skills?.[`${branch}.${sk}`] || 0) * 8;
      }
    }
  }
  score += (RACE_JOB_BONUS[agent.race]?.[jobType] || 0);
  const branches = RACE_SKILL_DEPTH[agent.race] || [];
  const jobBranch = { mage: 'magic', thief: 'crime', guard: 'combat', blacksmith: 'craft' }[jobType];
  if (jobBranch && !branches.includes(jobBranch)) score -= 15;
  if (agent.personality?.includes('brave') && (jobType === 'guard' || jobType === 'adventurer')) score += 12;
  if (agent.personality?.includes('greedy') && jobType === 'merchant') score += 10;
  if (agent.personality?.includes('lazy') && jobType === 'farmer') score -= 8;
  return score;
}

function checkTierPromotion(settlement) {
  const tiers = ['homestead', 'hamlet', 'village', 'town', 'city', 'kingdom'];
  const idx = tiers.indexOf(settlement.tier);
  const thresholds = [0, 15, 35, 70, 140, 280];
  if (idx < tiers.length - 1 && settlement.population >= thresholds[idx + 1]) {
    settlement.tier = tiers[idx + 1];
  }
}

function rehireUnemployed(settlement, residents) {
  const seekers = residents.filter(a => !a.job && a.age >= 16 && !a.imprisoned);
  for (const agent of seekers) {
    const open = settlement.jobs.filter(j => j.filled < j.slots);
    if (!open.length) break;
    open.sort((a, b) => jobSuitability(agent, b.type) - jobSuitability(agent, a.type));
    const best = open[0];
    if (jobSuitability(agent, best.type) > 0) hireAgent(agent, settlement, best.type);
  }
}

export function hireAgent(agent, settlement, jobType) {
  const jobDef = settlement.jobs.find(j => j.type === jobType && j.filled < j.slots);
  if (!jobDef) return false;
  jobDef.filled++;
  agent.job = jobType;
  agent.employerId = settlement.id;
  return true;
}

export function grantJob(agent, settlement, jobType) {
  const existing = settlement.jobs.find(j => j.type === jobType);
  if (!existing) settlement.jobs.push({ type: jobType, slots: 1, filled: 0 });
  const jobDef = settlement.jobs.find(j => j.type === jobType);
  if (agent.job) {
    const old = settlement.jobs.find(j => j.type === agent.job);
    if (old) old.filled = Math.max(0, old.filled - 1);
  }
  jobDef.filled = Math.min(jobDef.slots, jobDef.filled + 1);
  agent.job = jobType;
  agent.employerId = settlement.id;
  return true;
}
