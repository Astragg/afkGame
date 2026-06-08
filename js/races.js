export const RACES = {
  Human: {
    lifespan: 80,  fertility: 0.7, stats: { str: 1, int: 1, dex: 1 }, skillDepth: 'full',
    bonuses: { 'leadership.govern': 5, 'leadership.trade': 5 },
    description: 'Adaptable and ambitious. Skilled leaders and traders.',
    color: '#d4b896',
  },
  Goblin: {
    lifespan: 40,  fertility: 1.2, stats: { str: 0.7, int: 0.9, dex: 1.3 }, skillDepth: 'narrow',
    bonuses: { 'crime.stealth': 8, 'craft.build': 4 },
    description: 'Nimble and prolific. Born sneaks and scavengers.',
    color: '#88b848',
  },
  Orc: {
    lifespan: 55,  fertility: 0.9, stats: { str: 1.4, int: 0.7, dex: 0.8 }, skillDepth: 'narrow',
    bonuses: { 'combat.melee': 10, 'survival.hunt': 6 },
    description: 'Powerful warriors. Feared on the battlefield.',
    color: '#7a9450',
  },
  Elf: {
    lifespan: 500, fertility: 0.3, stats: { str: 0.8, int: 1.3, dex: 1.1 }, skillDepth: 'narrow',
    bonuses: { 'magic.elemental': 10, 'survival.forage': 6 },
    description: 'Ancient and wise. Masters of magic and nature.',
    color: '#c8e0a0',
  },
  Dwarf: {
    lifespan: 250, fertility: 0.5, stats: { str: 1.2, int: 1.0, dex: 0.7 }, skillDepth: 'narrow',
    bonuses: { 'craft.smith': 10, 'craft.build': 8 },
    description: 'Stout and industrious. Unmatched craftsmen and miners.',
    color: '#c8a060',
  },
};

// Racial tensions: certain races have historic friction
export const RACIAL_TENSIONS = {
  'Orc-Elf': 0.6,
  'Goblin-Dwarf': 0.5,
  'Orc-Human': 0.3,
};

export function getRacialTension(raceA, raceB) {
  const key1 = `${raceA}-${raceB}`, key2 = `${raceB}-${raceA}`;
  return RACIAL_TENSIONS[key1] || RACIAL_TENSIONS[key2] || 0;
}

export const RACE_LIST = Object.keys(RACES);

export const PERSONALITY_TRAITS = [
  'brave', 'greedy', 'loyal', 'vindictive', 'kind', 'lazy',
  'ambitious', 'honest', 'cunning', 'shy', 'charismatic', 'violent',
];

export function generatePersonality(rng) {
  const count = rng.int(2, 4);
  return rng.shuffle(PERSONALITY_TRAITS).slice(0, count);
}

const FIRST = ['Aldric', 'Brenna', 'Cedric', 'Dara', 'Eldon', 'Faye', 'Gareth', 'Helena', 'Ivan', 'Jora',
  'Kael', 'Lira', 'Magnus', 'Nessa', 'Orin', 'Petra', 'Quinn', 'Rhea', 'Soren', 'Thora',
  'Grik', 'Snaga', 'Mok', 'Grash', 'Thrak', 'Aelindra', 'Finwe', 'Thorin', 'Balin', 'Dwalin'];
const LAST = ['Ashford', 'Blackwood', 'Crane', 'Dunmore', 'Evershade', 'Frost', 'Grimshaw', 'Holloway',
  'Ironhelm', 'Jade', 'Keen', 'Lockhart', 'Moonbrook', 'Northwind', 'Oakenshield', 'Pryce'];

export function generateName(rng, race) {
  const first = rng.pick(FIRST);
  const last = rng.pick(LAST);
  if (race === 'Goblin') return `${first}k`;
  if (race === 'Orc') return `${first}ok`;
  return `${first} ${last}`;
}
