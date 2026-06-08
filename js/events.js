/** Global event bus for simulation events */
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.queue = [];
    this.history = [];
    this.maxHistory = 500;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
    return () => {
      const arr = this.listeners.get(type);
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  emit(type, data = {}) {
    const evt = { type, data, tick: data.tick ?? 0, time: Date.now() };
    this.queue.push(evt);
    if (this.queue.length > 300) this.queue.shift();
    this.history.push(evt);
    if (this.history.length > this.maxHistory) this.history.shift();
    const fns = this.listeners.get(type) || [];
    for (const fn of fns) fn(evt);
    const all = this.listeners.get('*') || [];
    for (const fn of all) fn(evt);
  }

  flush() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}

export const EVENT = {
  BIRTH: 'birth',
  DEATH: 'death',
  MARRIAGE: 'marriage',
  CRIME: 'crime',
  ARREST: 'arrest',
  TRIAL: 'trial',
  TRADE: 'trade',
  QUEST: 'quest',
  QUEST_COMPLETE: 'questComplete',
  FAMINE: 'famine',
  BANKRUPTCY: 'bankruptcy',
  WEATHER: 'weather',
  LEVEL_UP: 'levelUp',
  GUILD_JOIN: 'guildJoin',
  DUNGEON_CLEAR: 'dungeonClear',
  CONQUEST: 'conquest',
  WAR: 'war',
  WAR_START: 'warStart',
  DISASTER: 'disaster',
  FACTION_CHANGE: 'factionChange',
  ARTIFACT_CREATED: 'artifactCreated',
  CARAVAN_RAIDED: 'caravanRaided',
  LEGEND_BORN: 'legendBorn',
  OLD_AGE_DEATH: 'oldAgeDeath',
  EXTREME_WEATHER: 'extremeWeather',
  GOD_ACT: 'godAct',
  AGE_ADVANCE: 'ageAdvance',
  MILESTONE: 'milestone',
  DYNASTY_CHANGE: 'dynastyChange',
};
