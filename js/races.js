export const RACES = {
  Human: { lifespan: 80, fertility: 0.7, stats: { str: 1, int: 1, dex: 1 }, skillDepth: 'full' },
  Goblin: { lifespan: 40, fertility: 1.2, stats: { str: 0.7, int: 0.9, dex: 1.3 }, skillDepth: 'narrow' },
  Orc: { lifespan: 50, fertility: 0.9, stats: { str: 1.4, int: 0.7, dex: 0.8 }, skillDepth: 'narrow' },
  Elf: { lifespan: 300, fertility: 0.4, stats: { str: 0.8, int: 1.3, dex: 1.1 }, skillDepth: 'narrow' },
  Dwarf: { lifespan: 200, fertility: 0.6, stats: { str: 1.2, int: 1.0, dex: 0.7 }, skillDepth: 'narrow' },
};

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
