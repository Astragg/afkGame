import { hexToPixel, hexKey } from './hex.js';
import {
  getSkyGradient, drawAgentPortrait, RACE_COLORS,
  drawBuildingIcon, drawConstructionSite, getDayNightOverlay,
} from './textures.js';
import { BIOME_BY_ID } from './biomes.js';
import { formatWallet } from './currency.js';

const THEME = {
  glass: 'rgba(16,20,34,0.86)',
  glassLight: 'rgba(28,34,54,0.9)',
  border: 'rgba(120,150,215,0.30)',
  accent: '#7aa2ff',
  accentWarm: '#ffd27a',
  text: '#e2ebff',
  dim: '#94a8cc',
  good: '#7ddf9a',
  bad: '#ff8a8a',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hexSize = 13;
    this.camera = { x: 0, y: 0, zoom: 0.7 };
    this.hoverHex = null;
    this.selectedAgent = null;
    this.terrainCanvas = null;
    this.terrainOrigin = { x: 0, y: 0 };
    this.bakedFor = null;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsCount = 0;
    this._lastFpsT = performance.now();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  worldToScreen(wx, wy) {
    const { x, y, zoom } = this.camera;
    return {
      x: (wx + x) * zoom + this.canvas.width / 2,
      y: (wy + y) * zoom + this.canvas.height / 2,
    };
  }

  screenToWorld(sx, sy) {
    const { x, y, zoom } = this.camera;
    return {
      x: (sx - this.canvas.width / 2) / zoom - x,
      y: (sy - this.canvas.height / 2) / zoom - y,
    };
  }

  centerOn(q, r) {
    const { x, y } = hexToPixel(q, r, this.hexSize);
    this.camera.x = -x;
    this.camera.y = -y;
  }

  // ---- terrain pre-render (the big perf win) ----
  bakeTerrain(world) {
    const size = this.hexSize;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const hx of world.hexMap.values()) {
      const { x, y } = hexToPixel(hx.q, hx.r, size);
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    const pad = size * 2;
    const cw = Math.ceil(maxX - minX + pad * 2);
    const ch = Math.ceil(maxY - minY + pad * 2);
    const cvs = document.createElement('canvas');
    cvs.width = cw;
    cvs.height = ch;
    const tctx = cvs.getContext('2d');
    this.terrainOrigin = { x: minX - pad, y: minY - pad };

    // base fill so any sub-pixel seams read as deep water, not black
    tctx.fillStyle = '#0c1a30';
    tctx.fillRect(0, 0, cw, ch);

    // slight overlap closes vertex gaps between hexes
    for (const hx of world.hexMap.values()) {
      const { x, y } = hexToPixel(hx.q, hx.r, size);
      const cx = x - this.terrainOrigin.x;
      const cy = y - this.terrainOrigin.y;
      this._hexPath(tctx, cx, cy, size * 1.08);
      tctx.fillStyle = hx.baseColor || '#456';
      tctx.fill();
    }
    this.terrainCanvas = cvs;
    this.bakedFor = world;
  }

  _hexPath(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + size * Math.cos(a);
      const py = cy + size * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  render(world, agents, timeOfDay, weather, ui) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const zoom = this.camera.zoom;

    this._trackFps();

    if (this.bakedFor !== world || !this.terrainCanvas) this.bakeTerrain(world);

    // sky
    const sky = getSkyGradient(timeOfDay);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(0.5, sky[1]);
    grad.addColorStop(1, sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // terrain (single drawImage under camera transform)
    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, this.camera.x * zoom + w / 2, this.camera.y * zoom + h / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainCanvas, this.terrainOrigin.x, this.terrainOrigin.y);
    ctx.restore();

    // day/night tint overlay
    const overlay = getDayNightOverlay(timeOfDay);
    if (overlay) {
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, w, h);
    }

    const size = this.hexSize * zoom;

    // hover hex highlight
    if (this.hoverHex && !ui?.pauseMenuOpen) {
      const p = hexToPixel(this.hoverHex.q, this.hoverHex.r, this.hexSize);
      const s = this.worldToScreen(p.x, p.y);
      this._hexPath(ctx, s.x, s.y, size);
      ctx.strokeStyle = 'rgba(245,225,110,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // buildings + construction + dungeons (bounded iteration)
    this._drawStructures(ctx, world, size, w, h);

    // agents (culled)
    this._drawAgents(ctx, agents, size, w, h);

    // weather fx
    if (weather === 'rain' || weather === 'storm') this.drawWeatherParticles(weather);
    else if (weather === 'snow') this.drawSnow();
    else if (weather === 'fog') { ctx.fillStyle = 'rgba(200,210,225,0.18)'; ctx.fillRect(0, 0, w, h); }

    // vignette for depth
    this._vignette(ctx, w, h);

    // UI
    this.drawHUD(world, agents, timeOfDay, weather, ui);
    if (ui?.inspectAgent) this.drawInspectPanel(ui.inspectAgent, ui);
    if (ui?.hoverAgent) this.drawTooltip(ui.hoverAgent, ui.mouseX, ui.mouseY);
    else if (this.hoverHex && !ui?.inspectAgent && !ui?.pauseMenuOpen) this.drawHexTooltip(this.hoverHex, ui?.mouseX, ui?.mouseY);
    if (ui?.pauseMenu) ui.pauseMenu.draw(ctx, w, h, ui.game);
  }

  _trackFps() {
    const now = performance.now();
    const dt = now - this._lastFpsT;
    this._lastFpsT = now;
    if (dt > 0) {
      this._fpsAccum += 1000 / dt;
      this._fpsCount++;
      if (this._fpsCount >= 20) {
        this.fps = Math.round(this._fpsAccum / this._fpsCount);
        this._fpsAccum = 0;
        this._fpsCount = 0;
      }
    }
  }

  _onScreen(wx, wy, w, h, margin) {
    const s = this.worldToScreen(wx, wy);
    return s.x > -margin && s.x < w + margin && s.y > -margin && s.y < h + margin;
  }

  _drawStructures(ctx, world, size, w, h) {
    const margin = size * 3;
    for (const s of world.settlements || []) {
      for (const b of s.buildings || []) {
        const p = hexToPixel(b.hex.q, b.hex.r, this.hexSize);
        if (!this._onScreen(p.x, p.y, w, h, margin)) continue;
        const scr = this.worldToScreen(p.x, p.y);
        drawBuildingIcon(ctx, scr.x, scr.y - size * 0.2, size * 0.62, b.type);
      }
      for (const site of s.constructionQueue || []) {
        const p = hexToPixel(site.hex.q, site.hex.r, this.hexSize);
        if (!this._onScreen(p.x, p.y, w, h, margin)) continue;
        const scr = this.worldToScreen(p.x, p.y);
        drawConstructionSite(ctx, scr.x, scr.y, size * 0.7, site.type, site.progress / site.totalTicks);
      }
    }
    for (const d of world.dungeons || []) {
      const hex = world.hexMap.get(hexKey(d.hex.q, d.hex.r));
      if (hex?.dungeon && hex.dungeon.cleared >= hex.dungeon.depth) continue;
      const p = hexToPixel(d.hex.q, d.hex.r, this.hexSize);
      if (!this._onScreen(p.x, p.y, w, h, margin)) continue;
      const scr = this.worldToScreen(p.x, p.y);
      ctx.fillStyle = '#7a3acc';
      ctx.strokeStyle = '#2a1450';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y - size * 0.28);
      ctx.lineTo(scr.x - size * 0.26, scr.y + size * 0.18);
      ctx.lineTo(scr.x + size * 0.26, scr.y + size * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  _drawAgents(ctx, agents, size, w, h) {
    const margin = size * 2;
    const r = size * 0.34;
    for (const agent of agents) {
      if (agent.dead) continue;
      const p = hexToPixel(agent.q, agent.r, this.hexSize);
      const scr = this.worldToScreen(p.x, p.y);
      if (scr.x < -margin || scr.x > w + margin || scr.y < -margin || scr.y > h + margin) continue;
      const cx = scr.x, cy = scr.y - size * 0.5;
      const isSel = this.selectedAgent?.id === agent.id;

      // soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(scr.x, scr.y - size * 0.08, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = RACE_COLORS[agent.race] || '#fff';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#ffe14a' : 'rgba(20,24,36,0.9)';
      ctx.lineWidth = isSel ? 2.5 : 1;
      ctx.stroke();

      if (agent.crowned) {
        ctx.fillStyle = THEME.accentWarm;
        ctx.font = `bold ${Math.max(8, size * 0.34)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('♛', cx, cy - size * 0.42);
      } else if (!agent.hasHome) {
        ctx.fillStyle = 'rgba(210,140,70,0.9)';
        ctx.beginPath();
        ctx.arc(cx + r * 0.7, cy - r * 0.7, size * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      drawActionBadge(ctx, cx, cy - size * 0.5, size * 0.2, agent.currentAction);
    }
  }

  drawWeatherParticles(weather) {
    const ctx = this.ctx;
    const count = weather === 'storm' ? 160 : 80;
    ctx.strokeStyle = 'rgba(180,200,255,0.45)';
    ctx.lineWidth = 1;
    const t = Date.now() / 50;
    const slant = weather === 'storm' ? 5 : 2;
    for (let i = 0; i < count; i++) {
      const x = (i * 137 + t * (weather === 'storm' ? 9 : 5)) % this.canvas.width;
      const y = (i * 89 + t * 13) % this.canvas.height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant, y + 9);
      ctx.stroke();
    }
  }

  drawSnow() {
    const ctx = this.ctx;
    const t = Date.now() / 400;
    ctx.fillStyle = 'rgba(245,250,255,0.85)';
    for (let i = 0; i < 90; i++) {
      const x = (i * 167 + Math.sin(t + i) * 30 + t * 12) % this.canvas.width;
      const y = (i * 113 + t * 28) % this.canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _vignette(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- HUD ----------
  drawHUD(world, agents, timeOfDay, weather, ui) {
    const ctx = this.ctx;
    const pad = 14;
    const living = agents.filter(a => !a.dead).length;

    // Top-left main panel
    panel(ctx, pad, pad, 252, 116);
    accentBar(ctx, pad, pad, 252);
    ctx.textAlign = 'left';
    // logo diamond
    ctx.fillStyle = THEME.accent;
    ctx.beginPath();
    ctx.moveTo(pad + 18, pad + 16);
    ctx.lineTo(pad + 26, pad + 24);
    ctx.lineTo(pad + 18, pad + 32);
    ctx.lineTo(pad + 10, pad + 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Aetherworld', pad + 36, pad + 30);

    const hour = Math.floor(timeOfDay);
    const min = Math.floor((timeOfDay % 1) * 60);
    ctx.font = '600 22px "Segoe UI", sans-serif';
    ctx.fillStyle = THEME.text;
    ctx.fillText(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`, pad + 14, pad + 64);
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = THEME.dim;
    ctx.fillText(`Day ${ui?.day || 1}`, pad + 80, pad + 64);

    drawWeatherIcon(ctx, pad + 132, pad + 56, 11, weather);
    ctx.fillStyle = THEME.dim;
    ctx.fillText(weather, pad + 150, pad + 60);

    // chips row
    chip(ctx, pad + 14, pad + 78, `◍ ${living}`, THEME.accent);
    chip(ctx, pad + 84, pad + 78, `⚑ ${world.settlements?.length || 0}`, THEME.good);
    chip(ctx, pad + 150, pad + 78, `${ui?.speedLabel || '1x'}`, THEME.accentWarm);
    ctx.fillStyle = this.fps < 25 ? THEME.bad : THEME.dim;
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillText(`${this.fps} fps`, pad + 196, pad + 95);

    // settlement spotlight
    if (world.settlements?.length) {
      const s = world.settlements.reduce((a, b) => (b.population > a.population ? b : a), world.settlements[0]);
      const sy = pad + 128;
      panel(ctx, pad, sy, 252, 70);
      ctx.fillStyle = THEME.accent;
      ctx.font = '700 13px "Segoe UI", sans-serif';
      ctx.fillText(`${s.name}`, pad + 14, sy + 20);
      ctx.fillStyle = THEME.dim;
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.fillText(s.tier.toUpperCase(), pad + 14, sy + 36);
      const tw = s.treasuryWallet;
      const coin = tw ? `${tw.gold || 0}g ${tw.silver || 0}s` : `${Math.floor(s.treasury)}s`;
      bar(ctx, pad + 14, sy + 44, 224, 6, Math.min(1, s.foodStore / 300), THEME.good);
      ctx.fillStyle = THEME.dim;
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.fillText(`Pop ${s.population}  ·  Food ${Math.floor(s.foodStore)}  ·  ${coin}`, pad + 14, sy + 64);
    }

    this.drawMinimap(world, pad);
    this.drawSpeedControls(ui);
  }

  drawMinimap(world, pad) {
    const ctx = this.ctx;
    const mw = 196, mh = 150;
    const mx = this.canvas.width - mw - pad;
    const my = pad;
    panel(ctx, mx, my, mw, mh);
    if (!this.terrainCanvas) return;
    const inset = 8;
    const ix = mx + inset, iy = my + inset, iw = mw - inset * 2, ih = mh - inset * 2;
    const tc = this.terrainCanvas;
    const scale = Math.min(iw / tc.width, ih / tc.height);
    const dw = tc.width * scale, dh = tc.height * scale;
    const dx = ix + (iw - dw) / 2, dy = iy + (ih - dh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tc, dx, dy, dw, dh);

    // settlement dots
    for (const s of world.settlements || []) {
      const p = hexToPixel(s.hex.q, s.hex.r, this.hexSize);
      const sx = dx + (p.x - this.terrainOrigin.x) * scale;
      const sy = dy + (p.y - this.terrainOrigin.y) * scale;
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // viewport rectangle
    const halfW = (this.canvas.width / 2) / this.camera.zoom;
    const halfH = (this.canvas.height / 2) / this.camera.zoom;
    const vx = dx + (-this.camera.x - halfW - this.terrainOrigin.x) * scale;
    const vy = dy + (-this.camera.y - halfH - this.terrainOrigin.y) * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(vx, vy, halfW * 2 * scale, halfH * 2 * scale);
    ctx.restore();
  }

  speedLayout() {
    const labels = ['☰', '¼', '½', '1', '2', '4', '8', '▸▎'];
    const bw = 40, gap = 4, n = labels.length;
    const totalW = n * bw + (n - 1) * gap;
    const x0 = this.canvas.width / 2 - totalW / 2;
    const y0 = this.canvas.height - 50;
    return labels.map((label, i) => ({ label, x: x0 + i * (bw + gap), y: y0, w: bw, h: 32 }));
  }

  drawSpeedControls(ui) {
    const ctx = this.ctx;
    const items = this.speedLayout();
    const bx = items[0].x - 8, by = items[0].y - 8;
    const totalW = items[items.length - 1].x + items[items.length - 1].w - items[0].x;
    panel(ctx, bx, by, totalW + 16, 48);
    items.forEach((it, i) => {
      const active = ui?.speedIndex === i;
      const isMenu = i === 0;
      roundRect(ctx, it.x, it.y, it.w, it.h, 7);
      ctx.fillStyle = active ? THEME.accent : isMenu ? 'rgba(120,90,180,0.55)' : 'rgba(40,48,72,0.9)';
      ctx.fill();
      ctx.fillStyle = active ? '#0c1020' : THEME.text;
      ctx.font = i === 0 || i === 7 ? '13px sans-serif' : '600 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, it.x + it.w / 2, it.y + it.h / 2 + 1);
    });
    ctx.textBaseline = 'alphabetic';
  }

  // ---------- tooltips ----------
  drawTooltip(agent, mx, my) {
    if (!agent || mx == null) return;
    const ctx = this.ctx;
    const lines = [
      `${agent.name}`,
      `${agent.race}${agent.crowned ? '  ♛' : ''} · ${agent.sex} · ${Math.floor(agent.age)}y`,
      `${agent.job || 'unemployed'} — ${agent.currentAction || 'idle'}`,
      `${formatWallet(agent.wallet)}`,
      agent.hasHome ? 'Has a home' : '⚠ Sleeps in the wild',
    ];
    const tw = 210, th = 22 + lines.length * 17 + 18;
    const x = Math.min(mx + 16, this.canvas.width - tw - 8);
    const y = Math.min(my + 16, this.canvas.height - th - 8);
    panel(ctx, x, y, tw, th);
    accentBar(ctx, x, y, tw, RACE_COLORS[agent.race]);
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.text;
    ctx.font = '700 13px "Segoe UI", sans-serif';
    ctx.fillText(lines[0], x + 12, y + 26);
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = THEME.dim;
    for (let i = 1; i < lines.length; i++) {
      ctx.fillStyle = i === lines.length - 1 && !agent.hasHome ? THEME.accentWarm : THEME.dim;
      ctx.fillText(lines[i], x + 12, y + 26 + i * 17);
    }
    // mini need bars
    const ny = y + th - 14;
    const needs = ['hunger', 'rest'];
    needs.forEach((k, i) => {
      bar(ctx, x + 12 + i * 100, ny, 88, 5, (agent.needs?.[k] || 0) / 100, i === 0 ? THEME.accentWarm : THEME.accent);
    });
  }

  drawHexTooltip(hex, mx, my) {
    if (!hex || mx == null) return;
    const biome = BIOME_BY_ID[hex.biomeId];
    const lines = [
      biome?.name || 'Unknown',
      `Elevation ${(hex.elevation * 100).toFixed(0)}%`,
      hex.waterDepth > 0.3 ? 'Water' : `Moisture ${(hex.moisture * 100).toFixed(0)}%`,
      hex.building ? `Building: ${hex.building.type}` : '',
    ].filter(Boolean);
    const ctx = this.ctx;
    const tw = 168, th = 14 + lines.length * 16 + 8;
    const x = Math.min(mx + 16, this.canvas.width - tw - 8);
    const y = Math.min(my + 16, this.canvas.height - th - 8);
    panel(ctx, x, y, tw, th);
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.text;
    ctx.font = '700 12px "Segoe UI", sans-serif';
    ctx.fillText(lines[0], x + 12, y + 22);
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = THEME.dim;
    for (let i = 1; i < lines.length; i++) ctx.fillText(lines[i], x + 12, y + 22 + i * 16);
  }

  // ---------- inspect panel ----------
  drawInspectPanel(agent, ui) {
    const ctx = this.ctx;
    const pw = 340, ph = this.canvas.height - 40;
    const px = this.canvas.width - pw - 16;
    const py = 20;
    panel(ctx, px, py, pw, ph);
    accentBar(ctx, px, py, pw, agent.crowned ? THEME.accentWarm : RACE_COLORS[agent.race]);

    drawAgentPortrait(ctx, px + 42, py + 44, 28, agent);
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.text;
    ctx.font = '700 17px "Segoe UI", sans-serif';
    ctx.fillText(agent.name, px + 84, py + 34);
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = THEME.dim;
    ctx.fillText(`${agent.race} · ${agent.sex} · ${Math.floor(agent.age)}y`, px + 84, py + 52);
    ctx.fillText(`${agent.job || 'unemployed'}`, px + 84, py + 68);
    ctx.fillStyle = THEME.accentWarm;
    ctx.fillText(formatWallet(agent.wallet), px + 84, py + 84);
    if (agent.crowned) {
      ctx.fillStyle = THEME.accentWarm;
      ctx.font = '700 12px sans-serif';
      ctx.fillText('♛ CROWNED', px + 230, py + 34);
    }

    // needs bars
    let y = py + 108;
    ctx.fillStyle = THEME.accent;
    ctx.font = '700 12px "Segoe UI", sans-serif';
    ctx.fillText('NEEDS', px + 16, y);
    y += 12;
    for (const [k, v] of Object.entries(agent.needs || {})) {
      ctx.fillStyle = THEME.dim;
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.fillText(k, px + 16, y + 8);
      bar(ctx, px + 90, y + 1, 234, 7, v / 100, v < 25 ? THEME.bad : THEME.good);
      y += 16;
    }

    y += 8;
    const sections = [
      ['TOP SKILLS', getTopSkills(agent)],
      ['RELATIONSHIPS', (agent.relationships || []).slice(0, 4).map(r => `${r.name}: ${r.type} (${Math.floor(r.affinity)})`)],
      ['RECENT EVENTS', (agent.eventLog || []).slice(-6).map(e => `${e.text}`)],
      ['INVENTORY', (agent.inventory || []).map(i => `${i.type} ×${i.qty}`)],
    ];
    for (const [title, items] of sections) {
      ctx.fillStyle = THEME.accent;
      ctx.font = '700 12px "Segoe UI", sans-serif';
      ctx.fillText(title, px + 16, y);
      y += 15;
      ctx.fillStyle = THEME.dim;
      ctx.font = '11px "Segoe UI", sans-serif';
      const list = items.length ? items : ['—'];
      for (const item of list.slice(0, 6)) {
        ctx.fillText(String(item).slice(0, 44), px + 20, y);
        y += 14;
      }
      y += 8;
      if (y > py + ph - 130) break;
    }

    // divine buttons
    const buttons = ui?.divineButtons || [];
    const cols = 3, bwid = 100, bhei = 28, gap = 6;
    const startY = py + ph - (Math.ceil(buttons.length / cols) * (bhei + gap)) - 12;
    buttons.forEach((btn, i) => {
      const bx = px + 16 + (i % cols) * (bwid + gap);
      const by = startY + Math.floor(i / cols) * (bhei + gap);
      roundRect(ctx, bx, by, bwid, bhei, 6);
      ctx.fillStyle = 'rgba(90,72,160,0.85)';
      ctx.fill();
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.font = '600 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, bx + bwid / 2, by + 18);
      btn.bounds = { x: bx, y: by, w: bwid, h: bhei };
    });
    ctx.textAlign = 'left';
  }

  // ---------- hit tests ----------
  hitTestAgent(agents, sx, sy) {
    const size = this.hexSize * this.camera.zoom;
    const hitR = (size * 0.5) ** 2;
    let best = null, bestD = Infinity;
    for (const agent of agents) {
      if (agent.dead) continue;
      const p = hexToPixel(agent.q, agent.r, this.hexSize);
      const scr = this.worldToScreen(p.x, p.y);
      const dx = sx - scr.x;
      const dy = sy - (scr.y - size * 0.5);
      const d = dx * dx + dy * dy;
      if (d < hitR && d < bestD) { bestD = d; best = agent; }
    }
    return best;
  }

  hitTestSpeedControl(sx, sy) {
    const items = this.speedLayout();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (sx >= it.x && sx <= it.x + it.w && sy >= it.y && sy <= it.y + it.h) return i;
    }
    return -1;
  }
}

// ---------- shared draw helpers ----------
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

function panel(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = THEME.glass;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x, y, w, h, 10);
  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function accentBar(ctx, x, y, w, color = THEME.accent) {
  ctx.save();
  roundRect(ctx, x, y, w, 10, 10);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 3);
  ctx.restore();
}

function chip(ctx, x, y, text, color) {
  ctx.font = '600 11px "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 16;
  roundRect(ctx, x, y, w, 18, 9);
  ctx.fillStyle = 'rgba(40,48,72,0.85)';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 8, y + 13);
}

function bar(ctx, x, y, w, h, frac, color) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  if (frac > 0) {
    roundRect(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawWeatherIcon(ctx, cx, cy, r, weather) {
  ctx.save();
  if (weather === 'clear' || weather === 'heatwave') {
    ctx.fillStyle = weather === 'heatwave' ? '#ff9a4a' : '#ffd24a';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
      ctx.lineTo(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = weather === 'storm' ? '#7a86a0' : '#aab4c8';
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, cy, r * 0.5, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.55, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.5, cy + r * 0.1, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    if (weather === 'rain' || weather === 'storm') {
      ctx.strokeStyle = '#6aa0ff';
      ctx.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * r * 0.4, cy + r * 0.5);
        ctx.lineTo(cx + i * r * 0.4 - 2, cy + r * 1.1);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

const ACTION_COLORS = {
  eat: '#e0b84a', sleep: '#6f8ee0', sleep_wild: '#c07a3a', work: '#82c060',
  steal: '#e05050', patrol: '#5f93cc', travel: '#9aa4b4', socialize: '#d77ab0',
  quest: '#a86fd6', hunt: '#9a7a4a', fish: '#4aa0c0', adventure: '#e06a6a', idle: '#5a6378',
};

function drawActionBadge(ctx, x, y, r, action) {
  if (!action || action === 'idle') return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = ACTION_COLORS[action] || '#8a94a8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,18,28,0.9)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function getTopSkills(agent) {
  return Object.entries(agent.skills || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k.split('.').pop()}: ${v}`);
}
