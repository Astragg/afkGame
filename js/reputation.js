// Reputation: fame (heroic deeds), infamy (crimes), wanted level
// Read from agent.fame / agent.infamy / agent.wantedLevel

export function getReputationLabel(agent) {
  const fame = agent.fame || 0;
  const infamy = agent.infamy || 0;
  if (agent.wantedLevel >= 3) return { label: '☠ Outlaw', color: '#ff4444' };
  if (agent.wantedLevel >= 1) return { label: '⚠ Wanted', color: '#ff9900' };
  if (fame >= 200) return { label: '⭐ Legend', color: '#ffd700' };
  if (fame >= 100) return { label: '🌟 Champion', color: '#e8c040' };
  if (fame >= 40)  return { label: '🗡 Notable', color: '#a0c0ff' };
  if (infamy >= 60)return { label: '💀 Notorious', color: '#c060ff' };
  if (infamy >= 20)return { label: '🔪 Shady', color: '#d08040' };
  return { label: 'Unknown', color: '#94a8cc' };
}

export function tickReputation(agents, world, bus, tick) {
  if (tick % 48 !== 0) return;

  for (const agent of agents) {
    if (agent.dead) continue;

    // Fame decays slowly over time
    if (agent.fame > 0) agent.fame = Math.max(0, agent.fame - 0.5);
    if (agent.infamy > 0) agent.infamy = Math.max(0, agent.infamy - 0.3);

    // Wanted level: raised by infamy, crime events
    if (agent.wantedLevel > 0 && tick % 480 === 0) {
      agent.wantedLevel = Math.max(0, agent.wantedLevel - 1); // statute of limitations
    }

    // Guards will hunt highly-wanted agents
    if ((agent.wantedLevel || 0) >= 2) {
      const settlement = world.settlements.find(s => s.id === (agent.settlementId || agent.employerId));
      if (!settlement) continue;
      const guards = agents.filter(a =>
        !a.dead && (a.job === 'guard' || a.job === 'watchman') &&
        (a.settlementId === settlement.id || a.employerId === settlement.id)
      );
      if (guards.length > 0 && Math.random() < 0.1) {
        // Agent gets caught: loses wealth, wantedLevel drops
        const fine = 20 + (agent.wantedLevel || 0) * 15;
        if (agent.wallet && agent.wallet.silver >= fine) {
          agent.wallet.silver -= fine;
          agent.wantedLevel = Math.max(0, agent.wantedLevel - 1);
          agent.addEvent?.(tick, `Caught by guards — paid ${fine}s fine`);
        } else {
          agent.imprisoned = true;
          agent.wantedLevel = 0;
          agent.addEvent?.(tick, `Arrested and imprisoned!`);
        }
      }
    }
  }
}
