import { hexKey } from './hex.js';
import { formatWallet } from './currency.js';
import { getKingdomForSettlement } from './kingdoms.js';

export function buildSettlementDetails(world, agents, kingdoms) {
  return (world.settlements || []).map(s => {
    const kingdom = getKingdomForSettlement(kingdoms, s.id);
    const ruler = agents.find(a => a.id === s.rulerId);
    const residents = agents.filter(a => !a.dead && a.settlementId === s.id);
    const buildings = (s.buildings || []).map(b => {
      const hex = world.hexMap.get(hexKey(b.hex.q, b.hex.r));
      const building = hex?.building;
      return {
        type: b.type,
        hex: b.hex,
        completed: b.completed !== false,
        residents: building?.residents?.length || 0,
        capacity: building?.capacity || 0,
        prisoners: s.prisoners?.filter(p => !p.done && building?.type === 'prison').length || 0,
      };
    });
    const prisonRecords = (s.prisoners || []).filter(p => !p.done).map(p => {
      const agent = agents.find(a => a.id === p.agentId);
      return {
        id: p.agentId,
        name: p.name || agent?.name || 'Unknown',
        crime: p.crimeType || 'unknown',
        sentence: p.sentence,
        status: p.trialPending ? 'awaiting trial' : p.originalSentence || 'serving',
        arrestedTick: p.arrestedTick,
      };
    });
    const jobBreakdown = {};
    for (const a of residents) {
      if (a.job) jobBreakdown[a.job] = (jobBreakdown[a.job] || 0) + 1;
    }
    return {
      id: s.id,
      name: s.name,
      tier: s.tier,
      pop: s.population,
      territory: (s.territory || []).length,
      treasury: formatSettlementTreasury(s),
      ruler: ruler ? `${ruler.name} (${ruler.job || 'ruler'})` : 'None',
      kingdom: kingdom?.name || 'Independent',
      realmSize: kingdom?.settlementIds?.length || 1,
      military: kingdom?.military || 0,
      liege: s.liegeId ? world.settlements.find(x => x.id === s.liegeId)?.name : null,
      food: Math.floor(s.foodStore || 0),
      builds: (s.constructionQueue || []).length,
      buildings,
      jobs: jobBreakdown,
      trades: (s.recentTrades || []).slice(-5).reverse(),
      events: (s.recentEvents || []).slice(-5).reverse(),
      prisoners: prisonRecords,
    };
  });
}

function formatSettlementTreasury(s) {
  const w = s.treasuryWallet;
  if (w) {
    const parts = [];
    if (w.gold) parts.push(`${w.gold}g`);
    if (w.silver) parts.push(`${w.silver}s`);
    if (w.gems) parts.push(`${w.gems}♦`);
    return parts.join(' ') || '0';
  }
  return `${Math.floor(s.treasury || 0)}s`;
}

export function getBuildingInspectData(world, agents, settlement, hex) {
  const building = hex.building;
  if (!building) return null;
  const data = {
    type: building.type,
    settlement: settlement.name,
    settlementId: settlement.id,
    hex: { q: hex.q, r: hex.r },
    completed: !building.underConstruction,
    progress: building.progress,
  };
  if (building.type === 'home') {
    data.residents = (building.residents || []).map(id => {
      const a = agents.find(x => x.id === id);
      return a ? `${a.name} (${a.job || 'idle'})` : id;
    });
    data.capacity = building.capacity || 2;
  }
  if (building.type === 'prison') {
    data.capacity = building.capacity || 12;
    data.prisoners = (settlement.prisoners || []).filter(p => !p.done).map(p => {
      const a = agents.find(x => x.id === p.agentId);
      return {
        name: p.name || a?.name || 'Unknown',
        crime: p.crimeType || 'unknown',
        status: p.trialPending ? 'awaiting trial' : p.originalSentence || `serving (${p.sentence}t)`,
        sentence: p.sentence,
      };
    });
  }
  if (building.type === 'market') {
    data.trades = (settlement.recentTrades || []).slice(-6).reverse();
  }
  if (building.type === 'town_center') {
    data.ruler = settlement.rulerName || 'None';
    data.food = Math.floor(settlement.foodStore || 0);
    data.treasury = formatSettlementTreasury(settlement);
    data.events = (settlement.recentEvents || []).slice(-5).reverse();
  }
  if (building.type === 'farm') data.yields = 'Produces food for settlement';
  if (building.type === 'barracks') data.guards = agents.filter(a => a.job === 'guard' && a.settlementId === settlement.id).length;
  if (building.type === 'temple') data.mages = agents.filter(a => (a.job === 'mage' || a.job === 'priest') && a.settlementId === settlement.id).map(a => a.name);
  return data;
}
