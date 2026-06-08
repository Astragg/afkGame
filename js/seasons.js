export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const DAYS_PER_SEASON = 90;

export function getSeason(day) {
  return SEASONS[Math.floor(((day - 1) % (DAYS_PER_SEASON * 4)) / DAYS_PER_SEASON)];
}

export function getSeasonIndex(day) {
  return Math.floor(((day - 1) % (DAYS_PER_SEASON * 4)) / DAYS_PER_SEASON);
}

export function getYear(day) {
  return Math.floor((day - 1) / (DAYS_PER_SEASON * 4)) + 1;
}

export function getDayInSeason(day) {
  return ((day - 1) % DAYS_PER_SEASON) + 1;
}

export const SEASON_CFG = {
  spring: { foodMult: 1.3, birthMult: 1.4, deathMult: 0.8, tint: 'rgba(60,120,30,0.06)', label: '🌱 Spring', weatherWeights: [4,3,2,1,0,1,0] },
  summer: { foodMult: 1.6, birthMult: 1.1, deathMult: 0.85, tint: null, label: '☀ Summer', weatherWeights: [5,2,1,0,0,1,2] },
  autumn: { foodMult: 1.0, birthMult: 0.85, deathMult: 1.0, tint: 'rgba(140,70,10,0.09)', label: '🍂 Autumn', weatherWeights: [2,3,2,1,0,2,0] },
  winter: { foodMult: 0.35, birthMult: 0.55, deathMult: 1.5, tint: 'rgba(160,190,220,0.14)', label: '❄ Winter', weatherWeights: [1,1,1,1,4,1,0] },
};

export function getFoodMult(season) { return SEASON_CFG[season]?.foodMult ?? 1; }
export function getBirthMult(season) { return SEASON_CFG[season]?.birthMult ?? 1; }
export function getDeathMult(season) { return SEASON_CFG[season]?.deathMult ?? 1; }
export function getSeasonTint(season) { return SEASON_CFG[season]?.tint ?? null; }
export function getSeasonLabel(season) { return SEASON_CFG[season]?.label ?? season; }
