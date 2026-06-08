/** Skill tree definitions */
export const SKILL_BRANCHES = {
  crime: ['pickpocket', 'lockpick', 'stealth', 'fence', 'assassinate'],
  law: ['investigate', 'prosecute', 'defend', 'judge', 'legislate'],
  magic: ['elemental', 'healing', 'illusion', 'necromancy', 'enchant'],
  craft: ['smith', 'tailor', 'cook', 'alchemist', 'engineer'],
  leadership: ['persuade', 'command', 'govern', 'trade', 'teach'],
  survival: ['hunt', 'fish', 'farm', 'swim', 'forage'],
  combat: ['melee', 'ranged', 'dodge', 'tactics'],
};

export const ILLEGAL_MAGIC = ['necromancy'];

export const RACE_SKILL_DEPTH = {
  Human: Object.keys(SKILL_BRANCHES),
  Goblin: ['crime', 'survival', 'craft'],
  Orc: ['combat', 'survival', 'leadership'],
  Elf: ['magic', 'survival', 'craft'],
  Dwarf: ['craft', 'combat', 'leadership'],
};

export function createSkills(race) {
  const branches = RACE_SKILL_DEPTH[race] || RACE_SKILL_DEPTH.Human;
  const skills = {};
  for (const branch of branches) {
    for (const skill of SKILL_BRANCHES[branch]) {
      skills[`${branch}.${skill}`] = 0;
    }
  }
  return skills;
}

export function getSkillLevel(agent, branch, skill) {
  return agent.skills[`${branch}.${skill}`] || 0;
}

export function grantSkill(agent, branch, skill, level) {
  const key = `${branch}.${skill}`;
  if (agent.skills[key] !== undefined) {
    agent.skills[key] = Math.min(10, Math.max(0, level));
    return true;
  }
  return false;
}

export function addSkillXP(agent, branch, skill, amount) {
  const key = `${branch}.${skill}`;
  if (agent.skills[key] === undefined) return;
  agent.skillXP = agent.skillXP || {};
  agent.skillXP[key] = (agent.skillXP[key] || 0) + amount;
  const threshold = (agent.skills[key] + 1) * 100;
  if (agent.skillXP[key] >= threshold && agent.skills[key] < 10) {
    agent.skills[key]++;
    agent.skillXP[key] = 0;
    return true;
  }
  return false;
}

export function getTotalSkill(agent, branch) {
  const skills = SKILL_BRANCHES[branch] || [];
  return skills.reduce((s, sk) => s + getSkillLevel(agent, branch, sk), 0);
}
