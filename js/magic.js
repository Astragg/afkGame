import { ILLEGAL_MAGIC } from './skills.js';
import { commitCrime } from './crime.js';

export const SPELLS = {
  'magic.elemental': { name: 'Firebolt', mana: 10, legal: true, effect: 'damage' },
  'magic.healing': { name: 'Heal', mana: 15, legal: true, effect: 'heal' },
  'magic.illusion': { name: 'Veil', mana: 8, legal: true, effect: 'stealth' },
  'magic.necromancy': { name: 'Raise Dead', mana: 30, legal: false, effect: 'undead' },
  'magic.enchant': { name: 'Enchant', mana: 20, legal: true, effect: 'buff' },
};

export function castSpell(agent, spellKey, target, agents, world, bus, tick, timeOfDay) {
  const spell = SPELLS[spellKey];
  if (!spell) return false;
  const skill = agent.skills?.[spellKey] || 0;
  if (skill < 1) return false;
  if (agent.mana < spell.mana) return false;
  agent.mana -= spell.mana;
  agent.addEvent(tick, `Cast ${spell.name}`);

  if (!spell.legal || ILLEGAL_MAGIC.some(m => spellKey.includes(m))) {
    commitCrime(agent, 'illegal_magic', target, agents || [], world, bus, tick, timeOfDay);
  }

  if (spell.effect === 'heal' && target) {
    target.health = Math.min(100, (target.health || 100) + 20 + skill * 5);
  } else if (spell.effect === 'damage' && target) {
    target.health = (target.health || 100) - 15 - skill * 3;
  } else if (spell.effect === 'buff') {
    agent.blessed = (agent.blessed || 0) + 3;
  }
  return true;
}

export function divineBless(agent, tick) {
  agent.needs = agent.needs || {};
  for (const k of Object.keys(agent.needs)) agent.needs[k] = Math.min(100, agent.needs[k] + 30);
  agent.health = Math.min(100, (agent.health || 100) + 20);
  agent.blessed = (agent.blessed || 0) + 10;
  agent.addEvent(tick, 'Blessed by divine power');
}

export function divineCurse(agent, tick) {
  agent.cursed = (agent.cursed || 0) + 10;
  agent.health = Math.max(10, (agent.health || 100) - 15);
  for (const k of Object.keys(agent.needs || {})) agent.needs[k] = Math.max(0, agent.needs[k] - 20);
  agent.addEvent(tick, 'Cursed by divine power');
}
