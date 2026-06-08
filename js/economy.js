import { EVENT } from './events.js';
import { creditWallet, payFromWallet, formatWallet, walletTotal } from './currency.js';
import { addSkillXP, RACE_SKILL_DEPTH } from './skills.js';

export const JOB_TYPES = {
  farmer: { wage: 12, skill: 'survival.farm', produces: 'food' },
  fisher: { wage: 10, skill: 'survival.fish', produces: 'food' },
  guard: { wage: 18, skill: 'combat.melee', produces: null },
  blacksmith: { wage: 22, skill: 'craft.smith', produces: 'tools' },
  merchant: { wage: 16, skill: 'leadership.trade', produces: 'goods' },
  clerk: { wage: 8, skill: 'leadership.persuade', produces: null },
  mage: { wage: 25, skill: 'magic.elemental', produces: 'reagents' },
  priest: { wage: 14, skill: 'magic.healing', produces: null },
  thief: { wage: 0, skill: 'crime.stealth', produces: null },
  adventurer: { wage: 8, skill: 'combat.tactics', produces: 'loot' },
  noble: { wage: 35, skill: 'leadership.govern', produces: null },
};

export function tickEconomy(world, agents, bus, tick) {
  for (const settlement of world.settlements) {
    tickSettlementEconomy(settlement, agents, world, bus, tick);
  }
}

function getTreasury(settlement) {
  settlement.treasuryWallet = settlement.treasuryWallet || { gold: 0, silver: settlement.treasury || 0, copper: 0, gems: 0, tokens: 0 };
  return settlement.treasuryWallet;
}

function tickSettlementEconomy(settlement, agents, world, bus, tick) {
  const residents = agents.filter(a => !a.dead && a.settlementId === settlement.id);
  settlement.population = residents.length;
  settlement.unemployment = residents.filter(a => !a.job).length;
  const treasury = getTreasury(settlement);

  for (const jobDef of settlement.jobs) {
    const info = JOB_TYPES[jobDef.type];
    if (!info) continue;
    const workers = residents.filter(a => a.job === jobDef.type);
    for (const worker of workers) {
      const wage = info.wage;
      if ((treasury.silver || 0) + (treasury.gold || 0) * 100 >= wage) {
        if (treasury.silver >= wage) treasury.silver -= wage;
        else { treasury.gold -= 1; treasury.silver += 100 - wage; }
        worker.wallet = worker.wallet || { gold: 0, silver: 0, copper: 0, gems: 0, tokens: 0 };
        creditWallet(worker.wallet, wage);
        worker.addEvent(tick, `Earned ${wage}s as ${jobDef.type}`);
      }
      if (jobDef.type === 'farmer' && tick % 24 === 0) {
        const yield_ = 8 + (worker.skills?.['survival.farm'] || 0) * 2;
        settlement.foodStore += yield_;
        worker.addEvent(tick, `Harvested ${yield_} food`);
        addSkillXP(worker, 'survival', 'farm', 10);
      }
      if (jobDef.type === 'fisher' && tick % 12 === 0) {
        const yield_ = 5 + (worker.skills?.['survival.fish'] || 0);
        settlement.foodStore += yield_;
        worker.inventory.push({ type: 'fish', qty: 1 });
      }
      if (jobDef.type === 'merchant' && tick % 48 === 0) {
        tradeBetweenSettlements(world, settlement, bus, tick);
        if (Math.random() < 0.3) creditWallet(worker.wallet, 5 + Math.floor(Math.random() * 10));
      }
      if (jobDef.type === 'blacksmith' && tick % 36 === 0) {
        creditWallet(treasury, 8);
        worker.inventory.push({ type: 'tools', qty: 1 });
      }
      if (jobDef.type === 'mage' && tick % 48 === 0) {
        treasury.gems = (treasury.gems || 0) + 1;
        addSkillXP(worker, 'magic', 'elemental', 15);
        addSkillXP(worker, 'magic', 'enchant', 10);
        worker.mana = Math.min(100, (worker.mana || 50) + 5);
      }
      if (jobDef.type === 'priest' && tick % 36 === 0) {
        addSkillXP(worker, 'magic', 'healing', 12);
      }
      if (jobDef.type === 'guard' && tick % 24 === 0) {
        addSkillXP(worker, 'combat', 'melee', 10);
        addSkillXP(worker, 'combat', 'tactics', 8);
      }
      if (jobDef.type === 'noble' && tick % 48 === 0) {
        addSkillXP(worker, 'leadership', 'govern', 15);
        addSkillXP(worker, 'leadership', 'command', 10);
      }
      if (jobDef.type === 'thief' && tick % 48 === 0) {
        addSkillXP(worker, 'crime', 'stealth', 12);
      }
      if (jobDef.type === 'adventurer' && tick % 36 === 0) {
        addSkillXP(worker, 'combat', 'tactics', 10);
        addSkillXP(worker, 'combat', 'melee', 8);
      }
      if (jobDef.type === 'merchant' && tick % 24 === 0) {
        addSkillXP(worker, 'leadership', 'trade', 10);
      }
      if (jobDef.type === 'blacksmith' && tick % 36 === 0) {
        addSkillXP(worker, 'craft', 'smith', 12);
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
