import { EVENT } from './events.js';
import { walletTotal, payFromWallet, creditWallet } from './currency.js';

export const GUILD_TYPES = {
  adventurers: { name: 'Adventurers Guild', fee: 50, skill: 'combat.tactics', color: '#c04040' },
  thieves: { name: 'Thieves Guild', fee: 30, skill: 'crime.stealth', color: '#404040' },
  mages: { name: 'Mages Guild', fee: 80, skill: 'magic.elemental', color: '#4060c0' },
  crafters: { name: 'Crafters Guild', fee: 40, skill: 'craft.smith', color: '#c08040' },
};

export const GUILD_RANKS = ['novice', 'member', 'veteran', 'master', 'guildmaster'];

export function initGuilds(world) {
  const guilds = [];
  for (const [type, info] of Object.entries(GUILD_TYPES)) {
    const settlement = world.settlements[Math.floor(Math.random() * world.settlements.length)];
    if (!settlement) continue;
    guilds.push({
      id: `guild_${type}`,
      type,
      name: info.name,
      settlementId: settlement.id,
      members: [],
      quests: generateQuests(type, 3),
      treasury: 200,
      hallHex: settlement.hex,
    });
    settlement.buildings.push({ type: 'guild_hall', hex: settlement.hex, guildType: type });
  }
  return guilds;
}

function generateQuests(guildType, count) {
  const templates = {
    adventurers: ['Clear dungeon level', 'Escort merchant', 'Hunt monster', 'Collect bounty'],
    thieves: ['Steal from market', 'Fence goods', 'Bribe guard', 'Scout target'],
    mages: ['Gather reagents', 'Research spell', 'Enchant item', 'Teach apprentice'],
    crafters: ['Forge sword', 'Brew potion', 'Repair armor', 'Supply settlement'],
  };
  const quests = [];
  const pool = templates[guildType] || ['Generic quest'];
  for (let i = 0; i < count; i++) {
    quests.push({
      id: `quest_${guildType}_${i}`,
      title: pool[i % pool.length],
      reward: 20 + Math.floor(Math.random() * 80),
      xp: 10 + Math.floor(Math.random() * 30),
      completed: false,
      progress: 0,
      required: 3 + Math.floor(Math.random() * 5),
    });
  }
  return quests;
}

export function joinGuild(agent, guild, bus, tick) {
  const info = GUILD_TYPES[guild.type];
  agent.wallet = agent.wallet || { gold: 0, silver: 0, copper: 0, gems: 0, tokens: 0 };
  if (walletTotal(agent.wallet) < info.fee) return false;
  const skillKey = info.skill;
  if ((agent.skills?.[skillKey] || 0) < 1 && guild.type !== 'adventurers') return false;
  payFromWallet(agent.wallet, info.fee);
  guild.members.push({ agentId: agent.id, rank: 0, joinTick: tick });
  agent.guildId = guild.id;
  agent.guildRank = 0;
  agent.addEvent(tick, `Joined ${guild.name} as novice`);
  bus.emit(EVENT.GUILD_JOIN, { agent: agent.id, guild: guild.id, tick });
  return true;
}

export function tickGuilds(guilds, agents, bus, tick) {
  for (const guild of guilds) {
    if (tick % 48 === 0) {
      guild.quests = guild.quests.filter(q => !q.completed);
      while (guild.quests.length < 3) {
        guild.quests.push(...generateQuests(guild.type, 1));
      }
    }
    for (const member of guild.members) {
      const agent = agents.find(a => a.id === member.agentId);
      if (!agent || agent.dead) continue;
      if (agent.currentAction === 'quest' && agent.activeQuest) {
        agent.activeQuest.progress++;
        if (agent.activeQuest.progress >= agent.activeQuest.required) {
          completeQuest(agent, guild, agent.activeQuest, bus, tick);
        }
      }
    }
  }
}

function completeQuest(agent, guild, quest, bus, tick) {
  quest.completed = true;
  creditWallet(agent.wallet, quest.reward);
  guild.treasury += Math.floor(quest.reward * 0.1);
  agent.addEvent(tick, `Completed quest: ${quest.title} (+${quest.reward}g)`);
  const member = guild.members.find(m => m.agentId === agent.id);
  if (member && member.rank < GUILD_RANKS.length - 1) {
    member.questsCompleted = (member.questsCompleted || 0) + 1;
    if (member.questsCompleted >= (member.rank + 1) * 3) {
      member.rank++;
      agent.guildRank = member.rank;
      agent.addEvent(tick, `Promoted to ${GUILD_RANKS[member.rank]}`);
    }
  }
  agent.activeQuest = null;
  bus.emit(EVENT.QUEST, { agent: agent.id, quest: quest.id, tick });
}

export function assignQuest(agent, guild) {
  const available = guild.quests.filter(q => !q.completed);
  if (!available.length) return null;
  const quest = available[Math.floor(Math.random() * available.length)];
  agent.activeQuest = { ...quest, progress: 0 };
  return quest;
}
