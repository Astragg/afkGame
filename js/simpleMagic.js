import { addSkillXP } from './skills.js';

/** Lightweight magic: mages cast spells that buff/heal nearby agents.
 *  No particle systems — just stat effects + a glow flag for the renderer. */

const SPELLS = [
  { name: 'Heal', branch: 'magic', skill: 'healing', effect: _heal, xp: 12 },
  { name: 'Ward', branch: 'magic', skill: 'enchant', effect: _ward, xp: 10 },
  { name: 'Bolt', branch: 'magic', skill: 'elemental', effect: _bolt, xp: 15 },
  { name: 'Veil', branch: 'magic', skill: 'illusion', effect: _veil, xp: 8 },
];

export function tickSimpleMagic(agents, world, bus, tick) {
  if (tick % 18 !== 0) return;
  const mages = agents.filter(a => !a.dead && !a.imprisoned && (a.job === 'mage' || a.job === 'priest') && a.mana > 10);

  for (const mage of mages) {
    if (Math.random() > 0.22) continue;
    const spell = SPELLS[Math.floor(Math.random() * SPELLS.length)];
    const nearby = agents.filter(a =>
      !a.dead && a.id !== mage.id && a.settlementId === mage.settlementId &&
      Math.abs(a.q - mage.q) + Math.abs(a.r - mage.r) <= 3
    );
    if (!nearby.length && spell.name !== 'Ward') continue;

    spell.effect(mage, nearby, tick);
    addSkillXP(mage, spell.branch, spell.skill, spell.xp);
    mage.mana = Math.max(0, mage.mana - 8);
    mage.addEvent(tick, `Cast ${spell.name}`);
    // Set glow flag — renderer uses this for a brief visual
    mage.spellGlow = { tick, spell: spell.name };
  }

  // Mana regen
  for (const a of agents) {
    if (!a.dead) a.mana = Math.min(100, (a.mana || 0) + 0.15);
  }
}

function _heal(mage, nearby, tick) {
  const healed = nearby.filter(a => a.health < 80).slice(0, 3);
  for (const a of healed) {
    const amt = 15 + Math.floor((mage.skills?.['magic.healing'] || 0) * 3);
    a.health = Math.min(100, a.health + amt);
    a.addEvent(tick, `Healed by ${mage.name} (+${amt} health)`);
  }
}

function _ward(mage, nearby, tick) {
  const targets = nearby.slice(0, 4);
  for (const a of targets) {
    a.wardedTick = tick;
    a.needs.safety = Math.min(100, (a.needs.safety || 70) + 20);
  }
  mage.addEvent(tick, `Warded ${targets.length} allies`);
}

function _bolt(mage, nearby, tick) {
  const enemies = nearby.filter(a => a.legalStatus === 'wanted' || a.legalStatus === 'convicted');
  const targets = enemies.length ? enemies : nearby.filter(a => a.settlementId !== mage.settlementId);
  if (!targets.length) { _heal(mage, nearby, tick); return; }
  const target = targets[Math.floor(Math.random() * targets.length)];
  const dmg = 20 + Math.floor((mage.skills?.['magic.elemental'] || 0) * 4);
  target.health = Math.max(0, target.health - dmg);
  target.addEvent(tick, `Hit by ${mage.name}'s lightning bolt! (-${dmg}hp)`);
  if (target.health <= 0) target.dead = true;
}

function _veil(mage, nearby, tick) {
  mage.veiled = (mage.skills?.['magic.illusion'] || 0) >= 3;
  mage.addEvent(tick, `Cast Veil of Illusion`);
}
