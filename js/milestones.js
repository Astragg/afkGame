import { EVENT } from './events.js';

export const MILESTONES = [
  { id: 'first_birth',      label: '👶 First Birth',           desc: 'A child is born into the world.' },
  { id: 'pop_100',          label: '👥 Population 100',        desc: 'A hundred souls walk the land.' },
  { id: 'pop_250',          label: '🏘 Population 250',         desc: 'The world bustles with life.' },
  { id: 'pop_500',          label: '🌆 Population 500',         desc: 'A true civilization has emerged.' },
  { id: 'first_guild',      label: '⚔ First Guild Hall',       desc: 'Adventurers gather under one roof.' },
  { id: 'first_kingdom',    label: '👑 First Kingdom',         desc: 'A ruler claims dominion.' },
  { id: 'first_war',        label: '⚔ First War Declared',     desc: 'Banners clash for the first time.' },
  { id: 'first_artifact',   label: '🏺 First Legendary Artifact', desc: 'A mythic item is forged.' },
  { id: 'first_legend',     label: '🌟 First Legend Born',     desc: 'A hero\'s name echoes across realms.' },
  { id: 'first_quest',      label: '📜 First Quest Completed', desc: 'The guild board sees its first success.' },
  { id: 'first_plague',     label: '🦠 First Plague',          desc: 'Disease sweeps a settlement.' },
  { id: 'first_unification',label: '🐉 First Empire Unified',  desc: 'One kingdom rules three settlements.' },
  { id: 'age_guild',        label: '⚔ Guild Era Unlocked',     desc: 'The age of adventurers begins.' },
  { id: 'age_arcane',       label: '✨ Arcane Dawn',           desc: 'Magic reshapes civilization.' },
  { id: 'age_mythic',       label: '🐉 Mythic Era',            desc: 'The world enters its final legendary age.' },
  { id: 'dynasty_100days',  label: '👑 Dynasty Rules 100 Days', desc: 'A noble house holds power for a century of days.' },
];

export function initMilestones() {
  return { achieved: [], log: [] };
}

export function hasMilestone(milestones, id) {
  return milestones.achieved.includes(id);
}

export function awardMilestone(milestones, id, tick, bus, extra = {}) {
  if (hasMilestone(milestones, id)) return false;
  const def = MILESTONES.find(m => m.id === id);
  if (!def) return false;
  milestones.achieved.push(id);
  milestones.log.unshift({ id, label: def.label, tick, ...extra });
  if (milestones.log.length > 40) milestones.log.length = 40;
  bus.emit(EVENT.MILESTONE, { id, label: def.label, tick, ...extra });
  return true;
}

export function tickMilestones(milestones, world, agents, kingdoms, artifacts, guilds, bus, tick, day) {
  if (tick % 24 !== 0) return;
  const living = agents.filter(a => !a.dead);
  const pop = living.length;

  if (pop >= 100) awardMilestone(milestones, 'pop_100', tick, bus);
  if (pop >= 250) awardMilestone(milestones, 'pop_250', tick, bus);
  if (pop >= 500) awardMilestone(milestones, 'pop_500', tick, bus);

  const guildHalls = world.settlements.reduce((n, s) =>
    n + (s.buildings?.filter(b => b.type === 'guild_hall').length || 0), 0);
  if (guildHalls >= 1) awardMilestone(milestones, 'first_guild', tick, bus);

  if (kingdoms?.length >= 1) awardMilestone(milestones, 'first_kingdom', tick, bus);

  const unified = kingdoms?.filter(k => (k.settlementIds?.length || 0) >= 3).length || 0;
  if (unified >= 1) awardMilestone(milestones, 'first_unification', tick, bus);

  if ((artifacts?.length || 0) >= 1) awardMilestone(milestones, 'first_artifact', tick, bus);

  if ((world.age || 0) >= 2) awardMilestone(milestones, 'age_guild', tick, bus);
  if ((world.age || 0) >= 4) awardMilestone(milestones, 'age_arcane', tick, bus);
  if ((world.age || 0) >= 6) awardMilestone(milestones, 'age_mythic', tick, bus);
}

export function setupMilestoneListeners(milestones, bus) {
  bus.on(EVENT.BIRTH, (evt) => {
    awardMilestone(milestones, 'first_birth', evt.data.tick, bus);
  });
  bus.on(EVENT.WAR_START, (evt) => {
    awardMilestone(milestones, 'first_war', evt.data.tick, bus);
  });
  bus.on(EVENT.ARTIFACT_CREATED, (evt) => {
    awardMilestone(milestones, 'first_artifact', evt.data.tick, bus);
  });
  bus.on(EVENT.LEGEND_BORN, (evt) => {
    awardMilestone(milestones, 'first_legend', evt.data.tick, bus);
  });
  bus.on(EVENT.QUEST_COMPLETE, (evt) => {
    awardMilestone(milestones, 'first_quest', evt.data.tick, bus);
  });
  bus.on(EVENT.DISASTER, (evt) => {
    if (evt.data.type === 'disease' || evt.data.disease) {
      awardMilestone(milestones, 'first_plague', evt.data.tick, bus);
    }
  });
  bus.on(EVENT.AGE_ADVANCE, (evt) => {
    const to = evt.data.to;
    if (to >= 2) awardMilestone(milestones, 'age_guild', evt.data.tick, bus);
    if (to >= 4) awardMilestone(milestones, 'age_arcane', evt.data.tick, bus);
    if (to >= 6) awardMilestone(milestones, 'age_mythic', evt.data.tick, bus);
  });
}
