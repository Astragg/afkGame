import { BIOME_BY_ID } from './biomes.js';

/** Procedural color palettes — darker green = higher elevation */
const BIOME_COLORS = {
  0:  ['#0a1628', '#0d2040'],           // Deep Ocean
  1:  ['#1a4a6e', '#2a6a8e'],           // Shallow Sea
  2:  ['#e8d4a8', '#d4c090'],           // Beach
  3:  ['#3a7ab8', '#4a9ad0'],           // River
  4:  ['#4a6a4a', '#3a5a3a'],           // Marsh
  5:  ['#7ec850', '#9ed870'],           // Grassland
  6:  ['#c4a050', '#d4b060'],           // Savanna
  7:  ['#3a7a30', '#4a9a40'],           // Forest
  8:  ['#1a5a18', '#2a7a28'],           // Dense Forest
  9:  ['#2a5a40', '#3a7a58'],           // Taiga
  10: ['#b0c8c0', '#90a8a0'],           // Tundra
  11: ['#e8f0f8', '#d0e0f0'],           // Snow
  12: ['#d4b878', '#c4a868'],           // Desert
  13: ['#e8c878', '#d8b868'],           // Dunes
  14: ['#a07050', '#907040'],           // Badlands
  15: ['#4a2020', '#6a3030'],           // Volcanic
  16: ['#4a8a38', '#3a7a28'],           // Highlands (darker green)
  17: ['#90d860', '#a0e870'],           // Meadow
  18: ['#2a4a30', '#1a3a20'],           // Swamp
  19: ['#1a6a28', '#2a8a38'],           // Jungle
  20: ['#6a4a8a', '#8a6aaa'],           // Crystal Cavern
  21: ['#3a2840', '#2a1830'],           // Corrupted
};

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Procedural terrain color with elevation shading and per-tile variation. No day/night. */
export function getBaseHexColor(hex) {
  const biome = BIOME_BY_ID[hex.biomeId];
  const pair = BIOME_COLORS[hex.biomeId] || ['#888888', '#666666'];
  let rgb;

  if (hex.waterDepth > 0.05 || biome?.water) {
    // water: deeper = darker blue
    const depth = Math.min(1, Math.max(0.1, hex.waterDepth));
    rgb = [
      Math.floor(18 + (1 - depth) * 45),
      Math.floor(55 + (1 - depth) * 75),
      Math.floor(95 + depth * 70),
    ];
  } else {
    // land: blend the two palette tones by elevation, then shade by height
    const lo = hexToRgb(pair[1]);
    const hi = hexToRgb(pair[0]);
    const t = Math.min(1, Math.max(0, (hex.elevation - 0.36) / 0.5));
    rgb = mix(lo, hi, t);
    // darker at higher elevation for relief; lighter near coast
    const shade = 1 - t * 0.22;
    rgb = rgb.map(v => v * shade);
  }

  // subtle deterministic per-tile variation so terrain isn't flat
  const jitter = (((hex.q * 73856093) ^ (hex.r * 19349663)) >>> 0) % 17 / 17 - 0.5;
  const vf = 1 + jitter * 0.06;
  return `rgb(${clampByte(rgb[0] * vf)},${clampByte(rgb[1] * vf)},${clampByte(rgb[2] * vf)})`;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.floor(v)));
}

export function getHexColor(hex, timeOfDay = 12) {
  const base = hex.baseColor || getBaseHexColor(hex);
  return adjustBrightness(base, getDayNightFactor(timeOfDay));
}

export function getDayNightOverlay(timeOfDay) {
  const f = getDayNightFactor(timeOfDay);
  if (f >= 0.98) return null;
  // tint toward deep blue at night, warm at dawn/dusk
  let tint = '8,14,36';
  if ((timeOfDay >= 5 && timeOfDay < 7) || (timeOfDay >= 17 && timeOfDay < 20)) tint = '40,18,30';
  return `rgba(${tint},${(1 - f) * 0.82})`;
}

function getDayNightFactor(hour) {
  if (hour >= 6 && hour <= 18) {
    const midday = 12;
    const dist = Math.abs(hour - midday) / 6;
    return 0.85 + (1 - dist) * 0.15;
  }
  const nightHour = hour < 6 ? hour + 24 : hour;
  const darkness = hour < 6 ? (6 - hour) / 6 : (hour - 18) / 6;
  return 0.35 + (1 - darkness) * 0.2;
}

function adjustBrightness(color, factor) {
  if (color.startsWith('rgb')) {
    const m = color.match(/\d+/g);
    if (!m) return color;
    return `rgb(${m.map(v => Math.floor(+v * factor)).join(',')})`;
  }
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
  }
  return color;
}

export function getSkyGradient(timeOfDay) {
  const hour = timeOfDay;
  if (hour >= 5 && hour < 7) return ['#1a1040', '#ff8860', '#ffd080'];
  if (hour >= 7 && hour < 17) return ['#4080d0', '#80b8f0', '#c0e0ff'];
  if (hour >= 17 && hour < 20) return ['#1a2040', '#c06040', '#f0a060'];
  return ['#0a0820', '#101830', '#1a2040'];
}

export function drawAgentPortrait(ctx, x, y, size, agent) {
  const seed = agent.portraitSeed || 0;
  const skinTones = ['#f5d0a8', '#e8b888', '#c89868', '#a07050', '#705030'];
  const hairColors = ['#2a1810', '#8a5030', '#d0a040', '#f0e0c0', '#601818', '#304080'];
  const skin = skinTones[seed % skinTones.length];
  const hair = hairColors[(seed >> 3) % hairColors.length];
  const eyeStyle = seed % 3;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y - size * 0.55, size * 0.85, Math.PI, 0);
  ctx.fillStyle = hair;
  ctx.fill();

  const eyeY = y - size * 0.1;
  const eyeOff = size * 0.25;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(x - eyeOff, eyeY, size * 0.18, size * 0.22, 0, 0, Math.PI * 2);
  ctx.ellipse(x + eyeOff, eyeY, size * 0.18, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  const pupilColors = ['#4060a0', '#308040', '#804040'];
  ctx.fillStyle = pupilColors[eyeStyle];
  for (const ex of [x - eyeOff, x + eyeOff]) {
    ctx.beginPath();
    ctx.arc(ex, eyeY, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export const RACE_COLORS = {
  Human: '#e8c878',
  Goblin: '#70a848',
  Orc: '#5a8040',
  Elf: '#88c8a8',
  Dwarf: '#c89060',
};

export const BUILDING_COLORS = {
  home: '#a07050',
  farm: '#60a040',
  market: '#d0a040',
  tavern: '#904030',
  barracks: '#606878',
  prison: '#484848',
  guild_hall: '#6848a0',
  temple: '#d0c080',
  castle: '#888898',
  town_center: '#c0a060',
};

export function drawConstructionSite(ctx, cx, cy, hexSize, type, progress = 0) {
  const scale = FOOTPRINT_SCALE[type] || 1.5;
  const size = hexSize * scale;
  const h = size * (0.45 + progress * 0.4);
  ctx.fillStyle = '#6a5040';
  ctx.fillRect(cx - size * 0.35, cy - h, size * 0.7, h);
  ctx.strokeStyle = '#3a2818';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.35, cy - h, size * 0.7, h);
  ctx.strokeStyle = '#8a7858';
  for (let i = 0; i < 3; i++) {
    const ly = cy - h + i * (h / 3);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.4, ly);
    ctx.lineTo(cx + size * 0.4, ly);
    ctx.stroke();
  }
  ctx.fillStyle = '#c0a060';
  ctx.font = `${Math.max(7, size * 0.28)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.floor(progress * 100)}%`, cx, cy + size * 0.2);
}

const SPRITE_FILES = {
  home: 'assets/buildings/building_home.png',
  town_center: 'assets/buildings/building_town_center.png',
  prison: 'assets/buildings/building_prison.png',
  market: 'assets/buildings/building_market.png',
  farm: 'assets/buildings/building_farm.png',
};

const BUILDING_SPRITES = {};
let spritesReady = false;

function stripWhiteBackground(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245) px[i + 3] = 0;
  }
  cx.putImageData(data, 0, 0);
  const clean = new Image();
  clean.src = c.toDataURL('image/png');
  return new Promise(resolve => {
    clean.onload = () => resolve(clean);
    clean.onerror = () => resolve(img);
  });
}

export function loadBuildingSprites() {
  if (spritesReady) return Promise.resolve();
  const entries = Object.entries(SPRITE_FILES);
  return Promise.all(entries.map(([type, path]) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      stripWhiteBackground(img).then(clean => {
        BUILDING_SPRITES[type] = clean;
        resolve();
      });
    };
    img.onerror = () => resolve();
    img.src = path;
  }))).then(() => { spritesReady = true; });
}

const FOOTPRINT_SCALE = {
  town_center: 2.6, barracks: 2.4, temple: 2.4, prison: 2.2,
  market: 2.0, farm: 2.1, guild_hall: 2.0, tavern: 1.7,
  granary: 1.8, home: 1.6,
};

/** Draw a building spanning multiple hex tiles.
 *  cx,cy is the front-bottom center of the footprint (highest screen-y row).
 *  The sprite is drawn so its base aligns with cy (building sits ON the hex grid). */
export function drawBuildingSprite(ctx, cx, cy, hexSize, type, footprintSize = 1) {
  const scale = FOOTPRINT_SCALE[type] || 1.5;
  const w = hexSize * scale * Math.max(1, Math.sqrt(footprintSize));
  const h = w * 0.85;
  const x = cx - w / 2;
  // cy is the front-row center; draw the sprite so its bottom sits at cy
  const y = cy - h;

  const sprite = BUILDING_SPRITES[type];
  if (sprite?.complete && sprite.naturalWidth) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = hexSize * 0.25;
    ctx.shadowOffsetY = hexSize * 0.12;
    ctx.drawImage(sprite, x, y, w, h);
    ctx.restore();
    return;
  }

  drawBuildingIconLarge(ctx, cx, cy, w, type);
}

function drawBuildingIconLarge(ctx, cx, cy, w, type) {
  const color = BUILDING_COLORS[type] || '#888';
  const h = w * 0.75;
  const x = cx - w / 2;
  const y = cy - h;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = w * 0.08;
  ctx.shadowOffsetY = w * 0.05;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#1a1410';
  ctx.lineWidth = Math.max(1.5, w * 0.02);
  if (type === 'farm') {
    ctx.fillRect(x + w * 0.1, cy - h * 0.35, w * 0.55, h * 0.4);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.05, cy - h * 0.35);
    ctx.lineTo(x + w * 0.37, cy - h * 0.85);
    ctx.lineTo(x + w * 0.7, cy - h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (type === 'town_center' || type === 'castle') {
    ctx.fillRect(x + w * 0.15, cy - h * 0.55, w * 0.7, h * 0.55);
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(cx + i * w * 0.22 - w * 0.08, cy - h * 0.95, w * 0.16, h * 0.42);
    }
    ctx.strokeRect(x + w * 0.15, cy - h * 0.55, w * 0.7, h * 0.55);
  } else if (type === 'prison') {
    ctx.fillStyle = '#3a3a48';
    ctx.fillRect(x + w * 0.1, cy - h * 0.7, w * 0.8, h * 0.7);
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = w * 0.03;
    for (let i = 0; i < 4; i++) {
      const bx = x + w * 0.18 + i * w * 0.18;
      ctx.strokeRect(bx, cy - h * 0.55, w * 0.1, h * 0.35);
    }
  } else {
    ctx.fillRect(x + w * 0.2, cy - h * 0.45, w * 0.6, h * 0.45);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, cy - h * 0.45);
    ctx.lineTo(cx, cy - h * 0.9);
    ctx.lineTo(x + w * 0.85, cy - h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBuildingIcon(ctx, cx, cy, size, type) {
  drawBuildingSprite(ctx, cx, cy, size * 2.2, type, 1);
}
