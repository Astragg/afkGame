import { walletTotal } from './currency.js';
import { buildSettlementDetails } from './settlementInfo.js';

export function computeRankings(agents, world, kingdoms) {
  const living = agents.filter(a => !a.dead);

  return {
    swordsman: topBy(living, a => meleeScore(a), 10),
    mage: topBy(living, a => magicScore(a), 10),
    ruler: topBy(living, a => ruleScore(a), 10),
    advanced: topBy(living, a => totalSkills(a), 10),
    evil: topBy(living, a => evilScore(a), 10),
    wealthy: topBy(living, a => walletTotal(a.wallet), 10),
    oldest: topBy(living, a => a.age, 10),
    families: buildFamilyList(living),
    settlements: buildSettlementDetails(world, agents, kingdoms),
    worldStats: {
      hexes: world.hexMap?.size || 0,
      agents: living.length,
      dead: agents.filter(a => a.dead).length,
      settlements: world.settlements?.length || 0,
      dungeons: world.dungeons?.length || 0,
      homeless: living.filter(a => !a.hasHome).length,
    },
  };
}

function meleeScore(a) {
  return (a.skills?.['combat.melee'] || 0) * 10 + (a.skills?.['combat.tactics'] || 0) * 5
    + (a.skills?.['combat.dodge'] || 0) * 3 + (a.health || 0) * 0.1;
}

function magicScore(a) {
  return (a.skills?.['magic.elemental'] || 0) * 8 + (a.skills?.['magic.healing'] || 0) * 6
    + (a.skills?.['magic.illusion'] || 0) * 5 + (a.skills?.['magic.enchant'] || 0) * 7
    + (a.skills?.['magic.necromancy'] || 0) * 10 + (a.mana || 0) * 0.05;
}

function ruleScore(a) {
  let s = (a.skills?.['leadership.govern'] || 0) * 15 + (a.skills?.['leadership.command'] || 0) * 8;
  if (a.crowned) s += 100;
  if (a.job === 'noble') s += 30;
  if (a.sex === 'female' && a.crowned) s += 10;
  return s;
}

function totalSkills(a) {
  return Object.values(a.skills || {}).reduce((s, v) => s + v, 0);
}

function evilScore(a) {
  let s = (a.crimes?.length || 0) * 20;
  s += (a.skills?.['crime.assassinate'] || 0) * 8;
  s += (a.skills?.['crime.stealth'] || 0) * 3;
  s += (a.skills?.['magic.necromancy'] || 0) * 15;
  if (a.personality?.includes('greedy')) s += 10;
  if (a.personality?.includes('violent')) s += 15;
  if (a.personality?.includes('vindictive')) s += 8;
  if (a.legalStatus === 'wanted' || a.legalStatus === 'convicted') s += 25;
  if (a.cursed > 0) s += 5;
  return s;
}

function topBy(agents, fn, n) {
  return [...agents]
    .map(a => ({ agent: a, score: fn(a) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ agent, score }, i) => ({
      rank: i + 1,
      name: agent.name,
      race: agent.race,
      sex: agent.sex,
      score: Math.floor(score * 10) / 10,
      detail: rankDetail(agent),
      id: agent.id,
      crowned: agent.crowned,
    }));
}

function rankDetail(a) {
  const parts = [];
  if (a.job) parts.push(a.job);
  const topSkill = getTopSkillLabel(a);
  if (topSkill) parts.push(topSkill);
  if (a.crowned) parts.push('♛');
  if (!a.hasHome) parts.push('homeless');
  return parts.join(' · ') || 'wanderer';
}

function getTopSkillLabel(a) {
  let best = '', bestV = 0;
  for (const [k, v] of Object.entries(a.skills || {})) {
    if (v > bestV) { bestV = v; best = k.split('.')[1]; }
  }
  return bestV > 0 ? `${best} ${bestV}` : '';
}

function buildFamilyList(agents) {
  const families = new Map();
  for (const a of agents) {
    const key = a.parentIds?.length ? a.parentIds.sort().join('_') : (a.partnerId || a.id);
    if (!families.has(key)) families.set(key, { id: key, members: [], head: null });
    const fam = families.get(key);
    fam.members.push(a);
    if (a.crowned || a.job === 'noble') fam.head = a;
    if (!fam.head && a.age > 30) fam.head = a;
  }
  return [...families.values()]
    .filter(f => f.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, 15)
    .map((f, i) => ({
      rank: i + 1,
      name: f.head?.name || f.members[0].name,
      size: f.members.length,
      tree: formatFamilyTree(f.members, agents),
    }));
}

export function formatFamilyTree(members, allAgents) {
  const lines = [];
  const byId = new Map(allAgents.map(a => [a.id, a]));
  for (const m of members) {
    const parents = (m.parentIds || []).map(id => byId.get(id)?.name).filter(Boolean);
    const spouse = m.partnerId ? byId.get(m.partnerId)?.name : null;
    const children = allAgents.filter(a => a.parentIds?.includes(m.id)).map(a => a.name);
    let line = `${m.name} (${m.age.toFixed(0)}y, ${m.sex})`;
    if (parents.length) line += ` ← ${parents.join(' & ')}`;
    if (spouse) line += ` ♥ ${spouse}`;
    if (children.length) line += ` → ${children.join(', ')}`;
    lines.push(line);
  }
  return lines;
}

