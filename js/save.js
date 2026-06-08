const SAVE_KEY = 'aetherworld_save';

export function saveGame(state) {
  const data = {
    version: 1,
    seed: state.seed,
    tick: state.tick,
    day: state.day,
    timeOfDay: state.timeOfDay,
    weather: state.weather,
    agents: state.agents.map(serializeAgent),
    settlements: state.world.settlements,
    guilds: state.guilds,
    crownedId: state.crownedId,
  };
  const json = JSON.stringify(data);
  localStorage.setItem(SAVE_KEY, json);
  return json;
}

export function loadGame() {
  const json = localStorage.getItem(SAVE_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function exportSave(state) {
  const json = saveGame(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aetherworld_${state.seed}_${state.tick}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function serializeAgent(agent) {
  const { addEvent, ...rest } = agent;
  return rest;
}

export function deserializeAgent(data) {
  const agent = {
    ...data,
    wallet: data.wallet || { gold: 0, silver: data.gold || 10, copper: 0, gems: 0, tokens: 0 },
    hasHome: data.hasHome ?? false,
    addEvent(tick, text) {
      this.eventLog = this.eventLog || [];
      this.eventLog.push({ tick, text });
      if (this.eventLog.length > 50) this.eventLog.shift();
    },
  };
  return agent;
}
