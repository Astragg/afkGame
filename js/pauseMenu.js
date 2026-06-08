import { computeRankings } from './rankings.js';
import { formatWallet } from './currency.js';
import { getSeason, getYear, getDayInSeason, getSeasonLabel } from './seasons.js';
import { AGES, getAgeLabel } from './ages.js';
import { MILESTONES } from './milestones.js';
import { getDynastyLeaderboard } from './dynasties.js';
import { getAwaySummary } from './chronicle.js';

const TABS = ['Overview', 'Rankings', 'Families', 'Settlements', 'Chronicle'];

export class PauseMenu {
  constructor() {
    this.open = false;
    this.tab = 0;
    this.scroll = 0;
    this.rankCategory = 'swordsman';
    this.selectedFamily = 0;
    this.selectedSettlement = 0;
    this.bounds = { tabs: [], close: null, categories: [], settlements: [], agentRows: [], newWorld: null };
    this._pendingJump = null;
  }

  toggle() {
    this.open = !this.open;
    if (this.open) this.scroll = 0;
    return this.open;
  }

  close() {
    this.open = false;
  }

  hitTest(mx, my, canvasW, canvasH) {
    if (!this.open) return null;
    const b = this.bounds;
    if (b.close && mx >= b.close.x && mx <= b.close.x + b.close.w && my >= b.close.y && my <= b.close.y + b.close.h) {
      return { action: 'close' };
    }
    for (let i = 0; i < b.tabs.length; i++) {
      const t = b.tabs[i];
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) return { action: 'tab', index: i };
    }
    for (let i = 0; i < b.categories.length; i++) {
      const c = b.categories[i];
      if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) return { action: 'category', key: c.key };
    }
    for (let i = 0; i < (b.settlements || []).length; i++) {
      const s = b.settlements[i];
      if (mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h) return { action: 'settlement', index: i };
    }
    for (const row of b.agentRows || []) {
      if (mx >= row.x && mx <= row.x + row.w && my >= row.y && my <= row.y + row.h) {
        return { action: 'jumpToAgent', id: row.id };
      }
    }
    if (b.newWorld && mx >= b.newWorld.x && mx <= b.newWorld.x + b.newWorld.w &&
        my >= b.newWorld.y && my <= b.newWorld.y + b.newWorld.h) {
      return { action: 'newWorld' };
    }
    if (mx >= b.panel.x && mx <= b.panel.x + b.panel.w && my >= b.panel.y && my <= b.panel.y + b.panel.h) {
      return { action: 'panel' };
    }
    return { action: 'backdrop' };
  }

  handleClick(hit, game) {
    if (!hit) return false;
    if (hit.action === 'close' || hit.action === 'backdrop') { this.close(); return true; }
    if (hit.action === 'tab') { this.tab = hit.index; this.scroll = 0; return true; }
    if (hit.action === 'category') { this.rankCategory = hit.key; this.scroll = 0; return true; }
    if (hit.action === 'settlement') { this.selectedSettlement = hit.index; this.scroll = 0; return true; }
    if (hit.action === 'jumpToAgent') { this._pendingJump = hit.id; this.close(); return true; }
    if (hit.action === 'newWorld' && game) { game.newWorld(); return true; }
    return true;
  }

  draw(ctx, canvasW, canvasH, game) {
    if (!this.open) return;
    this.bounds.agentRows = [];
    const rankings = computeRankings(game.agents, game.world, game.kingdoms);

    ctx.fillStyle = 'rgba(5,8,18,0.88)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const pw = Math.min(900, canvasW - 40);
    const ph = Math.min(620, canvasH - 40);
    const px = (canvasW - pw) / 2;
    const py = (canvasH - ph) / 2;
    this.bounds.panel = { x: px, y: py, w: pw, h: ph };

    roundRect(ctx, px, py, pw, ph, 12);
    ctx.fillStyle = 'rgba(18,22,38,0.98)';
    ctx.fill();
    ctx.strokeStyle = '#6a88c0';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#e8f0ff';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Aetherworld — World Almanac', px + 20, py + 32);

    const closeX = px + pw - 44, closeY = py + 12;
    const nwX = closeX - 124, nwY = closeY, nwW = 116, nwH = 28;
    roundRect(ctx, nwX, nwY, nwW, nwH, 6);
    ctx.fillStyle = '#3a5040';
    ctx.fill();
    ctx.strokeStyle = '#6a9870';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#c8e8c0';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌍 New World', nwX + nwW / 2, nwY + 18);
    this.bounds.newWorld = { x: nwX, y: nwY, w: nwW, h: nwH };

    roundRect(ctx, closeX, closeY, 32, 28, 6);
    ctx.fillStyle = '#4a3060';
    ctx.fill();
    ctx.fillStyle = '#f0d0e0';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✕', closeX + 16, closeY + 19);
    this.bounds.close = { x: closeX, y: closeY, w: 32, h: 28 };

    this.bounds.tabs = [];
    const tabY = py + 48;
    TABS.forEach((label, i) => {
      const tx = px + 16 + i * 88;
      const active = this.tab === i;
      roundRect(ctx, tx, tabY, 82, 28, 6);
      ctx.fillStyle = active ? '#4a68a8' : '#2a3450';
      ctx.fill();
      ctx.fillStyle = active ? '#fff' : '#90a8c8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.font = '11px sans-serif';
      ctx.fillText(label, tx + 41, tabY + 18);
      this.bounds.tabs.push({ x: tx, y: tabY, w: 82, h: 28 });
    });

    const contentY = tabY + 44;
    const contentH = ph - (contentY - py) - 16;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 12, contentY, pw - 24, contentH);
    ctx.clip();

    switch (this.tab) {
      case 0: this.drawOverview(ctx, px, contentY, pw, rankings, game); break;
      case 1: this.drawRankings(ctx, px, contentY, pw, rankings); break;
      case 2: this.drawFamilies(ctx, px, contentY, pw, rankings); break;
      case 3: this.drawSettlements(ctx, px, contentY, pw, rankings); break;
      case 4: this.drawChronicle(ctx, px, contentY, pw, game); break;
    }
    ctx.restore();

    ctx.fillStyle = '#607090';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Space/Esc close  ·  Ctrl+Shift+N new random world  ·  ?seed=12345 in URL', canvasW / 2, py + ph - 8);
  }

  drawOverview(ctx, px, y, pw, rankings, game) {
    const ws = rankings.worldStats;
    const season = getSeason(game.day);
    const year = getYear(game.day);
    const dayInSeason = getDayInSeason(game.day);
    const seasonLabel = getSeasonLabel(season);
    const alliances = (game.kingdoms || []).reduce((n, k) => n + (k.allies?.length || 0), 0) / 2;
    const atWar = (game.kingdoms || []).filter(k => (k.atWar?.length || 0) > 0).length;

    const ageDef = AGES[game.world?.age || 0] || AGES[0];
    const lines = [
      ['World Seed', `${game.seed}`],
      ['World Age', `${ageDef.icon} ${ageDef.name}`],
      ['World Size', `${ws.hexes.toLocaleString()} hexes`],
      ['Population', `${ws.agents} living / ${ws.dead} dead`],
      ['Settlements', `${ws.settlements}`],
      ['Homeless', `${ws.homeless} sleeping rough`],
      ['Season', `${seasonLabel} — Year ${year}, Day ${dayInSeason}`],
      ['Weather', game.weather],
      ['Alliances', `${Math.floor(alliances)} active pacts`],
      ['At War', atWar > 0 ? `${atWar} kingdoms in conflict` : 'Peace'],
      ['Day', `${game.day} (${formatTime(game.timeOfDay)})`],
    ];
    let cy = y + 10;
    ctx.fillStyle = '#a0c0e8';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('World at a Glance', px + 24, cy);
    cy += 28;
    ctx.font = '13px sans-serif';
    for (const [label, val] of lines) {
      ctx.fillStyle = '#7090b0';
      ctx.fillText(label + ':', px + 32, cy);
      ctx.fillStyle = '#d0e8ff';
      ctx.fillText(val, px + 180, cy);
      cy += 20;
    }

    cy += 14;
    ctx.fillStyle = '#a0c0e8';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Champions  (click to follow)', px + 24, cy);
    cy += 22;
    const champs = [
      ['Strongest Swordsman', rankings.swordsman[0]],
      ['Greatest Mage', rankings.mage[0]],
      ['King / Queen', rankings.ruler[0]],
      ['Most Advanced', rankings.advanced[0]],
      ['Most Evil', rankings.evil[0]],
      ['Wealthiest', rankings.wealthy[0]],
    ];
    for (const [title, champ] of champs) {
      ctx.fillStyle = '#8098b8';
      ctx.font = '12px sans-serif';
      ctx.fillText(title + ':', px + 32, cy);
      if (champ) {
        // Clickable champion row
        const rx = px + 210, rw = pw - 240;
        roundRect(ctx, rx - 4, cy - 13, rw, 18, 4);
        ctx.fillStyle = 'rgba(60,80,120,0.35)';
        ctx.fill();
        ctx.fillStyle = champ.crowned ? '#ffd878' : '#c8e0ff';
        ctx.font = '600 12px "Segoe UI", sans-serif';
        const crown = champ.crowned ? ' ♛' : '';
        ctx.fillText(`${champ.name} (${champ.race}) ${champ.score}${crown}`, rx, cy);
        this.bounds.agentRows = this.bounds.agentRows || [];
        this.bounds.agentRows.push({ x: rx - 4, y: cy - 13, w: rw, h: 18, id: champ.id });
      }
      cy += 20;
    }
  }

  drawRankings(ctx, px, y, pw, rankings) {
    const cats = [
      { key: 'swordsman', label: 'Swordsmen' },
      { key: 'mage', label: 'Mages' },
      { key: 'ruler', label: 'Kings & Queens' },
      { key: 'advanced', label: 'Most Advanced' },
      { key: 'evil', label: 'Most Evil' },
      { key: 'wealthy', label: 'Wealthiest' },
    ];
    this.bounds.categories = [];
    cats.forEach((c, i) => {
      const cx = px + 20 + (i % 3) * 150;
      const cy = y + 6 + Math.floor(i / 3) * 30;
      const active = this.rankCategory === c.key;
      roundRect(ctx, cx, cy, 138, 24, 5);
      ctx.fillStyle = active ? '#5a4898' : 'rgba(40,48,72,0.9)';
      ctx.fill();
      ctx.fillStyle = active ? '#fff' : '#90a8c8';
      ctx.font = '600 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.label, cx + 69, cy + 16);
      this.bounds.categories.push({ x: cx, y: cy, w: 138, h: 24, key: c.key });
    });

    const list = rankings[this.rankCategory] || [];
    let ly = y + 92 - this.scroll;
    ctx.textAlign = 'left';
    for (const entry of list) {
      // Hover highlight + click target
      roundRect(ctx, px + 14, ly - 14, pw - 28, 20, 4);
      ctx.fillStyle = 'rgba(60,80,130,0.25)';
      ctx.fill();
      this.bounds.agentRows = this.bounds.agentRows || [];
      this.bounds.agentRows.push({ x: px + 14, y: ly - 14, w: pw - 28, h: 20, id: entry.id });

      ctx.fillStyle = entry.crowned ? '#ffd878' : '#cdddf6';
      ctx.font = '600 13px "Segoe UI", sans-serif';
      const crown = entry.crowned ? ' ♛' : '';
      ctx.fillText(`#${entry.rank}`, px + 24, ly);
      ctx.fillText(entry.name, px + 56, ly);
      ctx.fillStyle = '#8098b8';
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${entry.race} · ${entry.detail} · ${entry.score}${crown}`, px + 700, ly);
      ctx.textAlign = 'left';
      // Hint
      ctx.fillStyle = 'rgba(120,160,220,0.6)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('click → follow', px + pw - 20, ly);
      ctx.textAlign = 'left';
      ly += 24;
    }
  }

  drawFamilies(ctx, px, y, pw, rankings) {
    let fy = y + 10 - this.scroll;
    ctx.textAlign = 'left';
    for (const fam of rankings.families) {
      ctx.fillStyle = '#a0c0e8';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`#${fam.rank}  ${fam.name}'s Line (${fam.size} members)`, px + 24, fy);
      fy += 18;
      ctx.fillStyle = '#90a8c8';
      ctx.font = '11px monospace';
      for (const line of fam.tree) {
        ctx.fillText(line.slice(0, 90), px + 36, fy);
        fy += 15;
      }
      fy += 10;
    }
    if (!rankings.families.length) {
      ctx.fillStyle = '#8090a8';
      ctx.font = '13px sans-serif';
      ctx.fillText('No large families yet — marriages and births will grow family trees.', px + 24, fy);
    }
  }

  drawSettlements(ctx, px, y, pw, rankings) {
    const list = rankings.settlements || [];
    this.bounds.settlements = [];
    let sy = y + 8 - this.scroll;
    const listW = 280;
    ctx.textAlign = 'left';
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const active = i === this.selectedSettlement;
      roundRect(ctx, px + 20, sy - 12, listW, 22, 4);
      ctx.fillStyle = active ? 'rgba(74,104,168,0.5)' : 'rgba(30,38,58,0.5)';
      ctx.fill();
      this.bounds.settlements.push({ x: px + 20, y: sy - 12, w: listW, h: 22 });
      ctx.fillStyle = active ? '#e8f0ff' : '#b0c8e8';
      ctx.font = '600 12px sans-serif';
      ctx.fillText(`${s.name}`, px + 28, sy + 2);
      ctx.fillStyle = '#8098b8';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${s.tier} · pop ${s.pop}`, px + 160, sy + 2);
      sy += 26;
    }

    const sel = list[this.selectedSettlement];
    if (!sel) return;
    let dx = px + 320;
    let dy = y + 8;
    const dw = pw - 340;
    ctx.fillStyle = '#a0c0e8';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${sel.name} — ${sel.tier}`, dx, dy);
    dy += 22;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#90a8c8';
    const info = [
      `Ruler: ${sel.ruler}`,
      `Realm: ${sel.kingdom} (${sel.realmSize} settlements)`,
      `Military power: ${sel.military}`,
      sel.liege ? `Liege: ${sel.liege}` : null,
      `Territory: ${sel.territory} hexes · Food: ${sel.food} · Treasury: ${sel.treasury}`,
      `Jobs: ${Object.entries(sel.jobs || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
      `Buildings: ${(sel.buildings || []).map(b => b.type).join(', ') || 'none'}`,
      sel.builds ? `Under construction: ${sel.builds} sites` : null,
    ].filter(Boolean);
    for (const line of info) {
      ctx.fillText(line, dx, dy);
      dy += 16;
    }

    dy += 8;
    ctx.fillStyle = '#7aa2ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Recent Trades', dx, dy); dy += 16;
    ctx.fillStyle = '#8098b8';
    ctx.font = '10px sans-serif';
    for (const t of (sel.trades || []).slice(0, 4)) {
      ctx.fillText(`${t.from} → ${t.to}: ${t.amount} ${t.goods}`, dx, dy); dy += 14;
    }
    if (!sel.trades?.length) { ctx.fillText('No recent trades', dx, dy); dy += 14; }

    dy += 6;
    ctx.fillStyle = '#7aa2ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Prisoners', dx, dy); dy += 16;
    ctx.fillStyle = '#8098b8';
    for (const p of (sel.prisoners || []).slice(0, 5)) {
      ctx.fillText(`${p.name}: ${p.crime} — ${p.status}`, dx, dy); dy += 14;
    }
    if (!sel.prisoners?.length) { ctx.fillText('No prisoners', dx, dy); dy += 14; }

    dy += 6;
    ctx.fillStyle = '#7aa2ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Recent Events', dx, dy); dy += 16;
    ctx.fillStyle = '#8098b8';
    for (const e of (sel.events || []).slice(0, 4)) {
      ctx.fillText(String(e.text || e).slice(0, 55), dx, dy); dy += 14;
    }
  }

  drawChronicle(ctx, px, y, pw, game) {
    const dx = px + 24;
    let cy = y + 10;
    const ageDef = AGES[game.world?.age || 0] || AGES[0];
    const nextAge = AGES[(game.world?.age || 0) + 1];

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a0c0e8';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${ageDef.icon} ${ageDef.name}`, dx, cy);
    cy += 18;
    ctx.fillStyle = '#8098b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(ageDef.desc, dx, cy);
    cy += 16;
    ctx.fillStyle = '#607890';
    ctx.font = '11px sans-serif';
    ctx.fillText(ageDef.flavor, dx, cy, pw - 48);
    cy += 28;

    if (nextAge) {
      ctx.fillStyle = '#7090b0';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Next: ${nextAge.icon} ${nextAge.name}`, dx, cy);
      cy += 22;
    }

    // Milestones
    ctx.fillStyle = '#a0c0e8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`🏆 Milestones (${game.milestones?.achieved?.length || 0}/${MILESTONES.length})`, dx, cy);
    cy += 18;
    ctx.font = '11px sans-serif';
    const achieved = new Set(game.milestones?.achieved || []);
    for (const m of MILESTONES) {
      const done = achieved.has(m.id);
      ctx.fillStyle = done ? '#7ddf9a' : '#506070';
      ctx.fillText(`${done ? '✓' : '○'} ${m.label}`, dx + 8, cy);
      cy += 14;
      if (cy > y + 200) break;
    }
    cy += 10;

    // Dynasty board (right column)
    const rx = px + pw / 2 + 8;
    let ry = y + 10;
    ctx.fillStyle = '#a0c0e8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('👑 Dynasty Scoreboard', rx, ry);
    ry += 20;
    const houses = getDynastyLeaderboard(game.dynasties || { houses: {} });
    ctx.font = '11px sans-serif';
    if (!houses.length) {
      ctx.fillStyle = '#607090';
      ctx.fillText('No ruling dynasties yet…', rx, ry);
    } else {
      houses.slice(0, 8).forEach((h, i) => {
        ctx.fillStyle = i === 0 ? '#ffd27a' : '#b0c8e8';
        ctx.fillText(`${i + 1}. ${h.name} — ${h.ruleTicks}d rule, ${h.settlements.length} lands`, rx, ry);
        ry += 14;
      });
    }
    ry += 16;

    // Away summary / recent chronicle
    const away = getAwaySummary(game.chronicle, game.tick || 0, 24);
    ctx.fillStyle = '#a0c0e8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(away ? `📜 While you were away (${away.daysAway} days)` : '📜 Recent Chronicle', rx, ry);
    ry += 18;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#8098b8';
    const entries = away ? away.entries : (game.chronicle?.entries || []).slice(0, 12);
    for (const e of entries) {
      ctx.fillText(String(e.text).slice(0, 48), rx, ry);
      ry += 13;
      if (ry > y + 380) break;
    }
  }
}

function formatTime(h) {
  const hour = Math.floor(h);
  const min = Math.floor((h % 1) * 60);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
