import { EVENT } from './events.js';
import { getAgeLabel } from './ages.js';

const SESSION_KEY = 'aetherworld_last_visit';

export function initChronicle() {
  return { entries: [], lastVisitTick: 0 };
}

export function setupChronicleListeners(chronicle, bus) {
  const log = (text, tick, category = 'world') => {
    chronicle.entries.unshift({ text, tick, category, day: Math.floor(tick / 24) + 1 });
    if (chronicle.entries.length > 200) chronicle.entries.length = 200;
  };

  bus.on('*', (evt) => {
    const t = evt.data.tick ?? evt.tick ?? 0;
    switch (evt.type) {
      case EVENT.BIRTH:
        log(`👶 A child was born`, t, 'birth'); break;
      case EVENT.DEATH:
        log(`💀 Someone perished (${evt.data.cause || 'unknown'})`, t, 'death'); break;
      case EVENT.WAR_START:
        log(`⚔ War: ${evt.data.aggressor?.name || '?'} vs ${evt.data.defender?.name || '?'}`, t, 'war'); break;
      case EVENT.ARTIFACT_CREATED:
        log(`🏺 Legendary artifact: ${evt.data.artifact?.name || 'unknown'}`, t, 'legend'); break;
      case EVENT.LEGEND_BORN:
        log(`🌟 ${evt.data.agent?.name || 'A hero'} became a legend!`, t, 'legend'); break;
      case EVENT.QUEST_COMPLETE:
        log(`📜 Quest done: ${evt.data.agent?.name || 'Adventurer'} — ${evt.data.quest?.label || ''}`, t, 'quest'); break;
      case EVENT.DISASTER:
        log(`⚠ Disaster: ${evt.data.type || evt.data.disease || 'calamity'}`, t, 'disaster'); break;
      case EVENT.AGE_ADVANCE:
        log(`${getAgeLabel(evt.data.to)} — ${evt.data.age?.flavor || ''}`, t, 'age'); break;
      case EVENT.MILESTONE:
        log(`🏆 ${evt.data.label}`, t, 'milestone'); break;
      case EVENT.CONQUEST:
        log(`🗺 Territory conquered`, t, 'war'); break;
      case 'succession':
        log(`👑 Succession in a settlement (${evt.data.type || ''})`, t, 'dynasty'); break;
      case EVENT.FAMINE:
        log(`🍞 Famine strikes ${evt.data.settlement?.name || 'a town'}`, t, 'disaster'); break;
      case EVENT.CRIME:
        if (evt.data.detected) log(`🔪 Crime detected: ${evt.data.type || 'theft'}`, t, 'crime'); break;
      case EVENT.GUILD_JOIN:
        log(`⚔ An adventurer joined a guild`, t, 'guild'); break;
      case EVENT.DUNGEON_CLEAR:
        log(`🗡 A dungeon was cleared!`, t, 'adventure'); break;
    }
  });
}

export function markVisit(tick) {
  try {
    sessionStorage.setItem(SESSION_KEY, String(tick));
  } catch { /* ignore */ }
  return tick;
}

export function getLastVisitTick() {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

export function getAwaySummary(chronicle, currentTick, minGap = 48) {
  const lastVisit = getLastVisitTick();
  if (currentTick - lastVisit < minGap) return null;

  const entries = chronicle.entries.filter(e => e.tick > lastVisit);
  if (!entries.length) return null;

  const ticksAway = currentTick - lastVisit;
  const daysAway = Math.floor(ticksAway / 24);

  const counts = {};
  for (const e of entries) counts[e.category] = (counts[e.category] || 0) + 1;

  return {
    ticksAway,
    daysAway,
    entries: entries.slice(0, 20),
    totalEvents: entries.length,
    counts,
    lastVisit,
  };
}
