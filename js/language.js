// Language & lore: each settlement keeps a chronicle log
// and generates unique local vocabulary

const SYLLABLES = ['al','ar','bor','cal','dar','eld','fen','gor','hal','ilm','kar','lor','myr','nor','oth','por','ron','sel','tor','ula','vor','wyn','xar','yor','zan'];

export function generateWord(rng, syllables = 2) {
  let word = '';
  for (let i = 0; i < syllables; i++) word += rng.pick(SYLLABLES);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function initLanguage(world, rng) {
  for (const settlement of world.settlements) {
    // Each settlement has a "local word" for a few concepts
    settlement.lexicon = {
      hello:  generateWord(rng, 2),
      enemy:  generateWord(rng, 2),
      trade:  generateWord(rng, 1),
      god:    generateWord(rng, 2),
    };
    settlement.chronicle = [];
  }
}

export function addChronicleEntry(settlement, text, tick) {
  settlement.chronicle = settlement.chronicle || [];
  const day = Math.floor(tick / 24) + 1;
  settlement.chronicle.unshift({ text, tick, day });
  if (settlement.chronicle.length > 50) settlement.chronicle.length = 50;
}

export function tickLanguage(world, agents, bus, tick) {
  if (tick % 240 !== 0) return;
  // Scholars and chroniclers write to the settlement chronicle
  for (const agent of agents) {
    if (agent.dead) continue;
    if (agent.job !== 'scholar' && agent.job !== 'chronicler') continue;
    const settlement = world.settlements.find(s =>
      s.id === (agent.settlementId || agent.employerId)
    );
    if (!settlement) continue;
    const entries = [
      `${agent.name} recorded this season's events.`,
      `The population of ${settlement.name} stands at ${settlement.population}.`,
      `Trade flows ${settlement.foodStore > 200 ? 'well' : 'poorly'} through ${settlement.name}.`,
      `${agent.name} catalogued ${Math.floor(Math.random() * 12 + 3)} rare findings.`,
      `A visitor from afar brought tales of distant lands to ${settlement.name}.`,
    ];
    const entry = entries[Math.floor(Math.random() * entries.length)];
    addChronicleEntry(settlement, entry, tick);
  }
}
