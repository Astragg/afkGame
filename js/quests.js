import { EVENT } from './events.js';
import { creditWallet } from './currency.js';
import { addSkillXP } from './skills.js';

const QUEST_TYPES = [
  { id: 'slay_beast',    label: 'Slay the Beast',      desc: 'A monster threatens the region.',    reward: 40, skill: 'combat.melee',    duration: 120, takers: ['adventurer','guard','ranger','warlord'] },
  { id: 'escort',        label: 'Escort Caravan',       desc: 'Guard a trade caravan safely.',       reward: 25, skill: 'combat.tactics',  duration: 96,  takers: ['guard','adventurer','ranger'] },
  { id: 'deliver_goods', label: 'Deliver Supplies',     desc: 'Rush supplies to a distant town.',    reward: 18, skill: 'leadership.trade', duration: 72, takers: ['courier','merchant','adventurer'] },
  { id: 'bounty',        label: 'Bounty: Criminal',     desc: 'Bring a fugitive to justice.',        reward: 35, skill: 'combat.melee',    duration: 144, takers: ['guard','adventurer','ranger','warlord'] },
  { id: 'gather_herbs',  label: 'Gather Rare Herbs',    desc: 'Collect herbs from the wilderness.',  reward: 20, skill: 'survival.forage', duration: 60,  takers: ['herbalist','healer','ranger'] },
  { id: 'investigate',   label: 'Investigate Ruins',    desc: 'Explore the old dungeon nearby.',     reward: 50, skill: 'combat.tactics',  duration: 168, takers: ['adventurer','mage','scholar'] },
  { id: 'repair_bridge', label: 'Repair the Bridge',    desc: 'Fix the damaged road.',               reward: 15, skill: 'craft.build',    duration: 48,  takers: ['carpenter','stonemason','architect'] },
  { id: 'spy_kingdom',   label: 'Spy on Rivals',        desc: 'Infiltrate a rival kingdom.',         reward: 45, skill: 'crime.stealth',  duration: 192, takers: ['spy','thief','assassin'] },
  { id: 'tutor_noble',   label: 'Tutor Noble Children', desc: 'Educate the lord\'s heirs.',          reward: 22, skill: 'leadership.govern', duration: 72, takers: ['scholar','chronicler','priest'] },
  { id: 'hunt_bounty',   label: 'Bounty: Wild Predator','desc': 'Kill the predator raiding farms.',  reward: 28, skill: 'survival.hunt',  duration: 96,  takers: ['hunter','ranger','adventurer'] },
];

export function initQuests() {
  return [];
}

export function tickQuests(quests, world, agents, bus, tick) {
  // Spawn new quests on settlement boards
  if (tick % 72 === 0) {
    for (const settlement of world.settlements) {
      const board = quests.filter(q => q.settlementId === settlement.id && q.status === 'open');
      if (board.length >= 4) continue;
      const qt = QUEST_TYPES[Math.floor(Math.random() * QUEST_TYPES.length)];
      const reward = qt.reward + Math.floor(Math.random() * 20) - 5;
      quests.push({
        id: `quest_${tick}_${settlement.id}`,
        type: qt.id,
        label: qt.label,
        desc: qt.desc,
        reward,
        skill: qt.skill,
        duration: qt.duration,
        settlementId: settlement.id,
        status: 'open',
        takerId: null,
        startTick: null,
        postedTick: tick,
        takers: qt.takers,
      });
    }
  }

  // Agents pick up quests
  if (tick % 24 === 0) {
    const openBySettlement = {};
    for (const q of quests) {
      if (q.status !== 'open') continue;
      if (!openBySettlement[q.settlementId]) openBySettlement[q.settlementId] = [];
      openBySettlement[q.settlementId].push(q);
    }
    for (const agent of agents) {
      if (agent.dead || agent.activeQuestId) continue;
      const sId = agent.settlementId || agent.employerId;
      if (!sId) continue;
      const available = (openBySettlement[sId] || []).filter(q => q.takers.includes(agent.job));
      if (!available.length) continue;
      if (Math.random() > 0.12) continue;
      const q = available[Math.floor(Math.random() * available.length)];
      q.status = 'active';
      q.takerId = agent.id;
      q.startTick = tick;
      agent.activeQuestId = q.id;
      agent.addEvent?.(tick, `Took quest: ${q.label}`);
    }
  }

  // Progress & complete quests
  for (const q of quests) {
    if (q.status !== 'active') continue;
    const elapsed = tick - (q.startTick || tick);
    if (elapsed < q.duration) continue;
    const agent = agents.find(a => a.id === q.takerId);
    q.status = 'completed';
    if (agent && !agent.dead) {
      agent.activeQuestId = null;
      creditWallet(agent.wallet, q.reward);
      agent.fame = (agent.fame || 0) + Math.floor(q.reward * 0.4);
      const [cat, sub] = q.skill.split('.');
      addSkillXP(agent, cat, sub, 20);
      agent.addEvent?.(tick, `Completed: ${q.label} (+${q.reward}s, +fame)`);
      const settlement = world.settlements.find(s => s.id === q.settlementId);
      if (settlement) {
        _pushEvent(settlement, `${agent.name} completed "${q.label}"`, tick);
        bus.emit(EVENT.QUEST_COMPLETE, { agent, quest: q, settlement, tick });
      }
    } else if (agent) {
      agent.activeQuestId = null;
    }
  }

  // Expire old open quests
  quests = quests.filter(q => !(q.status === 'open' && tick - q.postedTick > 480));
  return quests;
}

export function getSettlementQuestBoard(quests, settlementId) {
  return quests.filter(q => q.settlementId === settlementId && q.status !== 'completed');
}

function _pushEvent(settlement, text, tick) {
  settlement.events = settlement.events || [];
  settlement.events.unshift({ text, tick });
  if (settlement.events.length > 30) settlement.events.length = 30;
}
